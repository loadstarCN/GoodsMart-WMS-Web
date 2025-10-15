import CryptoJS from "crypto-js";
const { public: { clientEncryptionKey } } = useRuntimeConfig()
const SECRET_KEY = clientEncryptionKey;

// ================== 公共工具方法 ==================
type StorageType = typeof localStorage | typeof sessionStorage;

// 加解密核心方法（提取重复逻辑）
const encryptData = (value: unknown): string => {
  return CryptoJS.AES.encrypt(JSON.stringify(value), SECRET_KEY).toString();
};

const decryptData = <T>(cipherText: string): T | null => {
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.error(`[SecureStorage] 解密失败: ${(e as Error).message}`);
    return null;
  }
};

// 通用数据验证（合并重复的验证逻辑）
const validateData = <T>(data: any): data is T => {
  if (data?.hasOwnProperty('id') && data?.hasOwnProperty('user_name')) {
    return !!data.id && typeof data.user_name === "string";
  }
  return true;
};

// 通用存储处理器（策略模式）
const createStorageHandler = (storage: StorageType) => ({
  get: <T>(key: string): T | null => {
    try {
      const cipherText = storage.getItem(key);
      if (!cipherText) return null;

      const decrypted = decryptData<T>(cipherText);
      return decrypted && validateData<T>(decrypted) ? decrypted : null;
    } catch (e) {
      storage.removeItem(key);
      console.error(`[SecureStorage] 操作失败: ${(e as Error).message}`);
      return null;
    }
  },

  set: (key: string, value: unknown) => {
    try {
      if (!validateData(value)) {
        throw new Error("无效的存储数据类型");
      }
      storage.setItem(key, encryptData(value));
    } catch (e) {
      console.error(`[SecureStorage] 加密失败: ${(e as Error).message}`);
    }
  },

  remove: (key: string) => {
    try {
      storage.removeItem(key);
    } catch (e) {
      console.error(`[SecureStorage] 删除失败: ${(e as Error).message}`);
    }
  }
});

// ================== 暴露接口 ==================
export const secureLocalStorage = createStorageHandler(localStorage);
export const secureSessionStorage = createStorageHandler(sessionStorage);

