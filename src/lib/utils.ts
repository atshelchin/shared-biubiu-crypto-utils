import aesjs from 'aes-js';
import { BitcoinAddress } from 'bech32-buffer';
import bs58 from 'bs58';
import { blake2b, keccak, ripemd160, sha256, sha3 } from 'hash-wasm';
import { bytesToHex, hexToBytes } from 'viem';
import type { Hex } from 'viem';

import Ed25519 from './Ed25519.js';
import type {
  BTCAddressType,
  ETHAddress,
  PrivKey,
  PubKey,
  TronAddress,
} from './Interface';

// to address
export const toETHAddress = async (
  uncompressedPubKey: PubKey,
): Promise<ETHAddress> => {
  if (uncompressedPubKey.length == 65) {
    const hash = await keccak(uncompressedPubKey.slice(1, 65), 256);
    return `0x${hash.slice(-40)}`;
  }

  if (uncompressedPubKey.length == 64) {
    const hash = await keccak(uncompressedPubKey, 256);
    return `0x${hash.slice(-40)}`;
  }

  throw new Error('Invalid uncompressedPubKey');
};
export const toTronAddress = async (
  uncompressedPubKey: PubKey,
): Promise<TronAddress> => {
  const hexAddr = await toETHAddress(uncompressedPubKey);
  return await hexToTronBs58(hexAddr);
};

export const hexToTronBs58 = async (
  hexAddr: ETHAddress,
): Promise<TronAddress> => {
  const bytes = hexToBytes(hexAddr.replace('0x', '0x41') as Hex);

  const hash0 = await sha256(bytes);
  const hash1 = await sha256(hexToBytes(`0x${hash0}`));

  const checkSum = hexToBytes(`0x${hash1}`).slice(0, 4);

  return bs58.encode(new Uint8Array([...bytes, ...checkSum]));
};

export const tronBs58ToHex = (bs58Addr: TronAddress): ETHAddress => {
  const bytes = bs58.decode(bs58Addr);
  return `0x${bytesToHex(bytes).replace('0x41', '')}`.slice(
    0,
    42,
  ) as ETHAddress;
};

export const toETHWIF = (privkey: PrivKey): string => {
  return bytesToHex(privkey);
};

export const toTronWIF = (privkey: PrivKey): string => {
  return bytesToHex(privkey).replace('0x', '');
};

export const toAptosWIF = (privkey: PrivKey): string => {
  return bytesToHex(privkey.slice(0, 32));
};

export const toSUIWIF = (privkey: PrivKey): string => {
  return bytesToHex(privkey.slice(0, 32));
};

export const toSolanaWIF = (privkey: PrivKey): string => {
  const ed25519 = new Ed25519();
  const keypair = ed25519.generateKeyPairFromPrivkey(privkey);

  return bs58.encode(new Uint8Array([...keypair[0], ...keypair[1]]));
};

export const toBTCWIF = async (privkey: PrivKey): Promise<string> => {
  if (privkey.length == 32) {
    const data = new Uint8Array([128, ...privkey, 1]);
    const hash0 = await sha256(data);
    const hash1 = await sha256(hexToBytes(`0x${hash0}`));

    const checkSum = hexToBytes(`0x${hash1}`).slice(0, 4);

    return bs58.encode(new Uint8Array([...data, ...checkSum]));
  }

  throw new Error('Invalid privateKey length');
};
export const toBTCAddress = async (
  pubkey: PubKey,
  addressType: BTCAddressType,
) => {
  if (pubkey.length == 33) {
    if (addressType == 'P2PKH') {
      return await P2PKH(pubkey);
    }

    if (addressType == 'P2WPKH') {
      return await P2WPKH(pubkey);
    }
    if (addressType == 'P2SH-P2WPKH') {
      const address = await P2WPKH(pubkey);
      return await P2SH_P2WPKH(address);
    }

    throw new Error('Invalid addressType');
  }

  throw new Error('Invalid pubkey');
};

export const hash160 = async (data: Uint8Array): Promise<Uint8Array> => {
  const hash0 = await sha256(data);
  const hash1 = await ripemd160(hexToBytes(`0x${hash0}`));
  return hexToBytes(`0x${hash1}`);
};

export const P2PKH = async (pubkey: PubKey) => {
  const hash0 = await sha256(pubkey);
  const hash1 = await ripemd160(hexToBytes(`0x${hash0}`));
  const bytes0 = hexToBytes(`0x00${hash1}`);
  const hash2 = await sha256(bytes0);
  const hash3 = await sha256(hexToBytes(`0x${hash2}`));
  const checkSum = hexToBytes(`0x${hash3}`).slice(0, 4);

  return bs58.encode(new Uint8Array([...bytes0, ...checkSum]));
};

export const P2WPKH = async (pubkey: PubKey) => {
  const hash0 = await hash160(pubkey);
  const prefix = 'bc';
  const scriptVersion = 0;

  return new BitcoinAddress(prefix, scriptVersion, hash0).encode();
};

export const P2SH_P2WPKH = async (P2WPKHAddr: string) => {
  const decoded = BitcoinAddress.decode(P2WPKHAddr);
  const version = 0;
  const len = 20;
  const redeemScript = new Uint8Array([version, len, ...decoded.data]);
  return await P2SH(redeemScript);
};

export const P2SH = async (pubkey: PubKey) => {
  const hash0 = await hash160(pubkey);
  const versionPrefix = 5;
  const hash1 = await sha256(new Uint8Array([versionPrefix, ...hash0]));
  const hash2 = await sha256(hexToBytes(`0x${hash1}`));
  const checkSum = hexToBytes(`0x${hash2}`).slice(0, 4);
  return bs58.encode(new Uint8Array([versionPrefix, ...hash0, ...checkSum]));
};

export const toAptosAddress = async (pubkey: PubKey): Promise<string> => {
  const hash = await sha3(pubkey, 256);
  return `0x${hash}`;
};
export const toSolanaAddress = (pubkey: PubKey): string => {
  return bs58.encode(pubkey);
};
export const toSUIAddress = async (pubkey: PubKey): Promise<string> => {
  const data = await blake2b(new Uint8Array([0, ...pubkey]), 256);
  return normalizeSuiAddress(data.slice(0, SUI_ADDRESS_LENGTH * 2));
};

// AES encrypt
export const encrypt = async (
  key: Uint8Array,
  rawBytes: Uint8Array,
): Promise<Uint8Array> => {
  if (key.length >= 32) {
    const encryptKey = key.slice(0, 32);
    const aesCtr = new aesjs.ModeOfOperation.ctr(encryptKey);
    const encryptedBytes = aesCtr.encrypt(rawBytes);

    return encryptedBytes;
  }

  throw new Error('Invalid key');
};
export const decrypt = async (
  key: Uint8Array,
  encryptedBytes: Uint8Array,
): Promise<Uint8Array> => {
  if (key.length >= 32) {
    const decryptKey = key.slice(0, 32);
    const aesCtr = new aesjs.ModeOfOperation.ctr(decryptKey);
    const rawBytes = aesCtr.decrypt(encryptedBytes);

    return rawBytes;
  }

  throw new Error('Invalid key');
};

export const areUint8ArraysEqual = (arr1: Uint8Array, arr2: Uint8Array) => {
  if (arr1.length !== arr2.length) {
    return false;
  }

  return arr1.every((value, index) => value === arr2[index]);
};

export const SUI_ADDRESS_LENGTH = 32;
export function normalizeSuiAddress(
  value: string,
  forceAdd0x: boolean = false,
): string {
  let address = value.toLowerCase();
  if (!forceAdd0x && address.startsWith('0x')) {
    address = address.slice(2);
  }
  return `0x${address.padStart(SUI_ADDRESS_LENGTH * 2, '0')}`;
}
