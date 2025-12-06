import { expose } from 'comlink';
import * as pako from 'pako';

const zipOps = {
  async extractZip(arrayBuffer) {
    try {
      const inflater = new pako.Inflate({ raw: true });
      const chunkSize = 1024 * 64; // 64KB chunks for better performance
      let offset = 0;
      const compressedData = new Uint8Array(arrayBuffer);

      while (offset < compressedData.length) {
        const end = Math.min(offset + chunkSize, compressedData.length);
        const chunk = compressedData.subarray(offset, end);
        inflater.push(chunk, end === compressedData.length);
        offset = end;
      }

      if (inflater.err) {
        throw new Error(`Error inflating data: ${inflater.msg}`);
      }

      return {
        success: true,
        data: inflater.result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  },

  async findChatFile(files) {
    const chatRegex = /.*(?:chat|whatsapp).*\.txt$/i;
    return files.find(file => chatRegex.test(file.name));
  },

  async processZipContent(zipData) {
    const chatFile = await this.findChatFile(zipData.files);
    if (!chatFile) {
      throw new Error('No chat file found in ZIP');
    }

    const fileContent = await this.extractZip(chatFile.data);
    if (!fileContent.success) {
      throw new Error(`Failed to extract chat file: ${fileContent.error}`);
    }

    // Process attachments
    const attachments = [];
    for (const file of zipData.files) {
      if (file.name !== chatFile.name) {
        const extracted = await this.extractZip(file.data);
        if (extracted.success) {
          attachments.push({
            name: file.name,
            data: extracted.data
          });
        }
      }
    }

    return {
      chatContent: new TextDecoder().decode(fileContent.data),
      attachments
    };
  }
};

expose(zipOps);
