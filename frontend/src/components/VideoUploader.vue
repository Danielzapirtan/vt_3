<template>
  <div class="w-full max-w-2xl mx-auto p-6">
    <div class="glass-effect p-8">
      <!-- File Upload -->
      <div class="mb-8">
        <h3 class="text-xl font-semibold mb-4">Upload File</h3>
        <div
          class="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center
                 hover:border-indigo-400 transition-colors cursor-pointer"
          @drop.prevent="handleDrop"
          @dragover.prevent
          @click="triggerFileInput"
        >
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            accept="video/*,audio/*"
            @change="handleFileSelect"
          />
          <div v-if="!selectedFile" class="text-gray-400">
            <svg class="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="text-lg">Drop your file here or click to browse</p>
            <p class="text-sm mt-2">Supports video and audio files up to 500MB</p>
          </div>
          <div v-else class="text-green-400">
            <p class="text-lg">{{ selectedFile.name }}</p>
            <p class="text-sm">{{ formatFileSize(selectedFile.size) }}</p>
          </div>
        </div>
      </div>

      <!-- URL Input -->
      <div class="mb-8">
        <h3 class="text-xl font-semibold mb-4">Or Paste URL</h3>
        <div class="flex gap-3">
          <input
            v-model="url"
            type="text"
            placeholder="https://example.com/video.mp4"
            class="flex-1 px-4 py-3 bg-gray-800 rounded-lg border border-gray-700 
                   focus:border-indigo-400 focus:outline-none text-white"
            @keyup.enter="handleUrlSubmit"
          />
          <button
            @click="handleUrlSubmit"
            :disabled="!url || isProcessing"
            class="btn-primary"
          >
            Download
          </button>
        </div>
      </div>

      <!-- Process Button -->
      <button
        @click="processFile"
        :disabled="!selectedFile || isProcessing"
        class="btn-primary w-full"
      >
        <span v-if="!isProcessing">Start Transcription</span>
        <span v-else class="flex items-center justify-center gap-2">
          <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Processing...
        </span>
      </button>

      <!-- Progress -->
      <div v-if="progress.status" class="mt-6">
        <div class="flex items-center justify-between mb-2">
          <span class="text-sm text-gray-400">{{ progress.message }}</span>
          <span class="text-sm text-gray-400">{{ progress.status }}</span>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-2">
          <div
            class="bg-indigo-600 h-2 rounded-full transition-all duration-500"
            :style="{ width: progressBarWidth + '%' }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTranscriptionStore } from '../stores/transcription'

const store = useTranscriptionStore()
const fileInput = ref(null)
const selectedFile = ref(null)
const url = ref('')
const isProcessing = computed(() => store.isProcessing)
const progress = computed(() => store.progress)

const progressBarWidth = computed(() => {
  if (store.progress.status === 'downloading') return 25
  if (store.progress.status === 'transcribing') return 75
  if (store.progress.status === 'completed') return 100
  return 0
})

const triggerFileInput = () => {
  fileInput.value.click()
}

const handleFileSelect = (event) => {
  selectedFile.value = event.target.files[0]
}

const handleDrop = (event) => {
  selectedFile.value = event.dataTransfer.files[0]
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const processFile = () => {
  if (selectedFile.value) {
    store.uploadAndTranscribe(selectedFile.value)
  }
}

const handleUrlSubmit = () => {
  if (url.value) {
    store.downloadFromUrl(url.value)
  }
}
</script>
