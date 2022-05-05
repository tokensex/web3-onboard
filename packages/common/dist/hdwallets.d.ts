import type Common from '@ethereumjs/common';
import type { CustomNetwork } from './types';
/**
 * Creates the common instance used for signing
 * transactions with hardware wallets
 * @returns the initialized common instance
 */
export declare const getCommon: ({ customNetwork, chainId }: {
    customNetwork?: CustomNetwork | undefined;
    chainId: number;
}) => Promise<Common>;
