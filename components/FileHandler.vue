<template>
  <div
    class="file-handler pa-md-0"
    @dragover.prevent="dragOver"
    @dragleave.prevent="dragLeave"
    @drop.prevent="drop($event)"
  >
    <div class="drop-container">
      <label for="uploadmytextfile" style="cursor: pointer">
        <div
          :class="{
            isDragging: isDragging,
            smallFont: $vuetify.breakpoint.smAndDown,
            isSuccess: isSuccess,
          }"
          class="drop pa-3"
        >
          <input
            id="uploadmytextfile"
            multiple
            type="file"
            accept=".txt, .zip"
            @change="requestUploadFile"
          />
          <!-- Wrong File -->
          <div
            v-show="wrongFile"
            class="text-body-1 text-md-h6 text-xl-h5 w-100"
            v-html="$t('fileWrong')"
          ></div>
          <!-- is Dragging -->
          <div v-if="isDragging" class="w-100 h-100">
            <br />
            {{ $t("fileDrop") }}
          </div>
          <!-- Standard State -->
          <div
            v-if="!isDragging && !wrongFile && !processing"
            class="text-body-1 text-md-h6 text-xl-h5 w-100 h-100"
          >
            <v-icon v-if="!isSuccess" size="2em">mdi-file</v-icon>

            <div :class="{ 'text-caption': isSuccess }">
              <div v-if="isSuccess" v-html="$t('fileDone')"></div>
              <span
                v-if="$vuetify.breakpoint.mdAndUp"
                v-html="$t('fileSuccess')"
              >
              </span>
              <span
                v-if="$vuetify.breakpoint.smAndDown"
                v-html="$t('fileSelect')"
              >
              </span>

              <span v-if="isSuccess" v-html="$t('fileAnother')"></span>
              <span v-if="!isSuccess" v-html="$t('fileZip')"></span>
            </div>
          </div>
          <br />
          <div
            v-show="processing"
            class="text-body-1 text-md-h6 text-xl-h5 w-100 overflow-hidden"
          >
            <div class="loading" />
            <br />
            <span v-html="$t('fileProcessing')" />
          </div>
        </div>
      </label>
    </div>
  </div>
</template>

<script>
import { parseString } from "whatsapp-chat-parser";
import JSZip from "jszip";
import { GTAG_FILE, gtagEvent } from "~/utils/gtagValues";
import { storeWhatsAppChat } from '~/server/db';
import { wrap } from 'comlink';

export default {
  name: "FileHandler",
  data() {
    return {
      isDragging: false,
      wrongFile: false,
      processing: false,
      isSuccess: false,
      attachments: {},
      duckDBWorker: null,
      zipWorker: null
    };
  },
  async created() {
    // Initialize workers
    this.duckDBWorker = wrap(new Worker(new URL('../wasm/duckdb.worker.js', import.meta.url), { type: 'module' }));
    this.zipWorker = wrap(new Worker(new URL('../wasm/zip.worker.js', import.meta.url), { type: 'module' }));

    // Initialize DuckDB tables
    await this.duckDBWorker.createTables();
  },
  methods: {
    async extendDataStructure(chatObject) {
      let authors = {};
      let participants = {};

      chatObject.messages.forEach(function (object, index) {
        if (!(object.author in authors)) {
          authors[object.author] = 0;
          participants[object.author] = {
            messageCount: 1,
            firstMessage: object.date,
            lastMessage: object.date
          };
        } else {
          authors[object.author] += 1;
          participants[object.author].messageCount += 1;
          participants[object.author].lastMessage = object.date;
        }
        object.absolute_id = index;
        object.personal_id = authors[object.author];
      });

      // Store data in DuckDB
      try {
        await this.duckDBWorker.insertData(
          chatObject.messages.map((msg, id) => ({
            id,
            author: msg.author,
            message: msg.message,
            date: msg.date,
            hasMedia: msg.message.includes('<media omitted>'),
            mediaType: msg.message.includes('<media omitted>') ? this.detectMediaType(msg.message) : null,
            location: msg.message.includes('location:') ? { url: msg.message } : null
          })),
          participants
        );

        // Get comprehensive analysis
        const [
          chatSummary,
          messagesByParticipant,
          wordCountStats,
          messagesByHour,
          messagesByDayOfWeek,
          mostActiveDays,
          topEmojis,
          mediaStats,
          activityTrends,
          conversationPeaks
        ] = await Promise.all([
          this.duckDBWorker.getChatSummary(),
          this.duckDBWorker.getMessageCountByParticipant(),
          this.duckDBWorker.getWordCountStats(),
          this.duckDBWorker.getMessageFrequencyByHour(),
          this.duckDBWorker.getMessageFrequencyByDayOfWeek(),
          this.duckDBWorker.getMostActiveDays(10),
          this.duckDBWorker.getTopEmojis(10),
          this.duckDBWorker.getMediaStatistics(),
          this.duckDBWorker.getActivityTrends(),
          this.duckDBWorker.getConversationPeaks()
        ]);

        // Emit analysis results
        this.$emit('analysis_results', {
          chatSummary,
          messagesByParticipant,
          wordCountStats,
          messagesByHour,
          messagesByDayOfWeek,
          mostActiveDays,
          topEmojis,
          mediaStats,
          activityTrends,
          conversationPeaks
        });

      } catch (error) {
        console.error('Error analyzing chat data:', error);
      }
    },

    detectMediaType(message) {
      const mediaTypes = {
        'image omitted': 'image',
        'video omitted': 'video',
        'audio omitted': 'audio',
        'sticker omitted': 'sticker',
        'GIF omitted': 'gif',
        'document omitted': 'document'
      };

      for (const [pattern, type] of Object.entries(mediaTypes)) {
        if (message.toLowerCase().includes(pattern)) {
          return type;
        }
      }
      return 'other';
    },

    async zipLoadEndHandler(e) {
      try {
        const { chatContent, attachments } = await this.zipWorker.processZipContent({
          files: Array.from(e.target.files).map(file => ({
            name: file.name,
            data: file.arrayBuffer()
          }))
        });

        const messages = await parseString(chatContent, { parseAttachments: true });
        this.updateMessages({
          messages,
          attachments: attachments.map(att => ({
            name: att.name,
            decompressedData: att.data
          }))
        });
      } catch (error) {
        console.error('Error processing ZIP file:', error);
        this.showErrorMessage();
      }
    },

    txtLoadEndHandler(e) {
      parseString(e.target.result).then((messages) =>
        this.updateMessages({ messages: messages })
      );
    },

    updateMessages(chatObject) {
      this.extendDataStructure(chatObject);
      this.$emit("new_messages", chatObject);
      this.$emit("hide_explanation", true);
      this.processing = false;
      this.isSuccess = true;
      gtagEvent("parsed", GTAG_FILE);
    },

    showErrorMessage(text = undefined) {
      this.wrongFile = true;
      this.processing = false;
      this.isSuccess = false;
      gtagEvent("error" + (text || ""), GTAG_FILE, 0);
    },
    processFileList(fileList, shared = false) {
      this.isDragging = false;
      this.processing = true;
      this.isSuccess = false;
      this.wrongFile = false;

      if (shared || fileList.length > 1) {
        //do multiple here
        this.readSharedFiles(fileList);
      } else {
        let file = fileList[0];
        if (!file) return this.showErrorMessage("_undefined_shared_file");
        // do singles here
        const reader = new FileReader();
        if (/^application\/(?:x-)?zip(?:-compressed)?$/.test(file.type)) {
          reader.addEventListener("loadend", this.zipLoadEndHandler);
          reader.readAsArrayBuffer(file);
        } else if (file.type === "text/plain") {
          reader.addEventListener("loadend", this.txtLoadEndHandler);
          reader.readAsText(file);
        } else {
          this.showErrorMessage();
        }
      }
    },

    dragOver() {
      this.isDragging = true;
    },

    dragLeave() {
      this.isDragging = false;
    },

    drop(e) {
      let fileList = e.dataTransfer.files;
      this.processFileList(fileList);
    },

    requestUploadFile() {
      let src = this.$el.querySelector("#uploadmytextfile");
      let fileList = src.files;
      this.processFileList(fileList);
    },
  },
};
</script>

<style lang="scss" scoped>
.w-100 {
  width: 100%;
}

.smallFont p {
  font-size: 1.1em !important;
}

.file-handler {
  text-align: center;
  background: $c-blue-accent;
}

.drop-container {
  background-color: $c-blue-accent-light;
  border-radius: 10px;
  padding: 10px;
}

.drop {
  display: flex;
  align-items: center;
  justify-items: center;
  //min-height: 150px;
  // outline
  border: 2px dashed rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  color: black;
  //background: white;
}

@keyframes attention {
  0% {
    box-shadow: 2px 2px 20px black;
  }

  50% {
    box-shadow: none;
  }

  100% {
    box-shadow: 2px 2px 20px black;
  }
}

textarea {
  width: 100%;
  height: 100%;
  object-fit: contain;
  resize: none;
}

input[type="file"] {
  display: none;
}

.isDragging {
  box-shadow: 0px 0px 40px black !important;
  border-style: solid;
  background: $c-dark;
  text-shadow: chartreuse;
  color: $c-blue-accent !important;
}

.isSuccess {
  // animation
  animation-name: done;
  animation-duration: 2s;
  animation-iteration-count: 1;
}

@keyframes done {
  0% {
    background: $c-blue-accent;
  }

  50% {
    background: greenyellow;
  }

  100% {
    background: $c-blue-accent;
  }
}
</style>
