import type { Chain, TransactionObject } from './types'

export async function rpcRequest(options: {
  url: string
  method: string
  params: unknown[]
}): Promise<unknown> {
  const { url, method, params } = options

  const response = await fetch(url, {
    method: 'POST',
    body: JSON.stringify({
      id: '42',
      method,
      params
    })
  }).then(res => res.json())

  if (response.result) {
    return response.result
  } else {
    throw response.error
  }
}

export async function getGasPrice(url: string): Promise<string> {
  const result = await rpcRequest({ url, method: 'eth_gasPrice', params: [] })
  return result as string
}

export async function populateTransaction(
  tx: TransactionObject,
  chain: Chain
): TransactionObject {
  const hasEip1559 = tx.maxFeePerGas != null || tx.maxPriorityFeePerGas != null

  if (tx.gasPrice != null && (tx.type === 2 || hasEip1559)) {
    throw new Error('eip-1559 transaction do not support gasPrice')
  } else if ((tx.type === 0 || tx.type === 1) && hasEip1559) {
    throw new Error(
      'pre-eip-1559 transaction do not support maxFeePerGas/maxPriorityFeePerGas'
    )
  }

  if (
    (tx.type === 2 || tx.type == null) &&
    tx.maxFeePerGas != null &&
    tx.maxPriorityFeePerGas != null
  ) {
    // Fully-formed EIP-1559 transaction (skip getFeeData)
    tx.type = 2
  } else if (tx.type === 0 || tx.type === 1) {
    // Explicit Legacy or EIP-2930 transaction

    // Populate missing gasPrice
    if (tx.gasPrice == null) {
      tx.gasPrice = await getGasPrice(chain.rpcUrl)
    }
  } else {
    // We need to get fee data to determine things
    const feeData = await this.getFeeData()

    if (tx.type == null) {
      // We need to auto-detect the intended type of this transaction...

      if (
        feeData.maxFeePerGas != null &&
        feeData.maxPriorityFeePerGas != null
      ) {
        // The network supports EIP-1559!

        // Upgrade transaction from null to eip-1559
        tx.type = 2

        if (tx.gasPrice != null) {
          // Using legacy gasPrice property on an eip-1559 network,
          // so use gasPrice as both fee properties
          const gasPrice = tx.gasPrice
          delete tx.gasPrice
          tx.maxFeePerGas = gasPrice
          tx.maxPriorityFeePerGas = gasPrice
        } else {
          // Populate missing fee data
          if (tx.maxFeePerGas == null) {
            tx.maxFeePerGas = feeData.maxFeePerGas
          }
          if (tx.maxPriorityFeePerGas == null) {
            tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
          }
        }
      } else if (feeData.gasPrice != null) {
        // Network doesn't support EIP-1559...

        // ...but they are trying to use EIP-1559 properties
        if (hasEip1559) {
          logger.throwError(
            'network does not support EIP-1559',
            Logger.errors.UNSUPPORTED_OPERATION,
            {
              operation: 'populateTransaction'
            }
          )
        }

        // Populate missing fee data
        if (tx.gasPrice == null) {
          tx.gasPrice = feeData.gasPrice
        }

        // Explicitly set untyped transaction to legacy
        tx.type = 0
      } else {
        // getFeeData has failed us.
        logger.throwError(
          'failed to get consistent fee data',
          Logger.errors.UNSUPPORTED_OPERATION,
          {
            operation: 'signer.getFeeData'
          }
        )
      }
    } else if (tx.type === 2) {
      // Explicitly using EIP-1559

      // Populate missing fee data
      if (tx.maxFeePerGas == null) {
        tx.maxFeePerGas = feeData.maxFeePerGas
      }
      if (tx.maxPriorityFeePerGas == null) {
        tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      }
    }
  }

  if (tx.nonce == null) {
    tx.nonce = this.getTransactionCount('pending')
  }

  if (tx.gasLimit == null) {
    tx.gasLimit = this.estimateGas(tx).catch(error => {
      if (forwardErrors.indexOf(error.code) >= 0) {
        throw error
      }

      return logger.throwError(
        'cannot estimate gas; transaction may fail or may require manual gas limit',
        Logger.errors.UNPREDICTABLE_GAS_LIMIT,
        {
          error: error,
          tx: tx
        }
      )
    })
  }

  if (tx.chainId == null) {
    tx.chainId = this.getChainId()
  } else {
    tx.chainId = Promise.all([
      Promise.resolve(tx.chainId),
      this.getChainId()
    ]).then(results => {
      if (results[1] !== 0 && results[0] !== results[1]) {
        logger.throwArgumentError(
          'chainId address mismatch',
          'transaction',
          transaction
        )
      }
      return results[0]
    })
  }
}
