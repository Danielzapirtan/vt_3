<template>
  <div class="max-w-7xl mx-auto px-4 py-8">
    <div v-if="!store.currentJob" class="text-center text-gray-400 py-20">
      <p class="text-xl">No transcription yet</p>
      <router-link to="/" class="text-indigo-400 hover:text-indigo-300 mt-4 inline-block">
        Go to Home to start a new transcription
      </router-link>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="space-y-6">
        <VideoPlayer
          ref="videoPlayerRef"
          :videoUrl="videoUrl"
          :segments="store.currentJob.segments"
          @timeUpdate="handleTimeUpdate"
          @segmentChange="handleSegmentChange"
        />
        
        <!-- Format Converter -->
        <div class="glass-effect p-6">
          <h3 class="text-xl font-semibold mb-4">Format Converter</h3>
          <div class="flex gap-3">
            <select
              v-model="outputFormat"
              class="flex-1 px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 
                     focus:border-indigo-400 focus:outline-none text-white"
            >
              <option value="mp4">MP4</option>
              <option value="webm">WebM</option>
              <option value="avi">AVI</option>
              <option value="mov">MOV</option>
              <option value="mp3">MP3 (Audio)</option>
            </select>
            <button
              @click="convertFormat"
              :disabled="isConverting"
              class="btn-primary"
            >
              Convert
            </button>
          </div>
          <div v-if="isConverting" class="mt-2 text-sm text-gray-400">
            Converting...
          </div>
        </div>
      </div>

      <TranscriptionEditor
        :segments="store.currentJob.segments"
        :currentTime="currentTime"
        @segmentClick="handleEditorSegmentClick"
        @segmentsUpdate="handleSegmentsUpdate"
        @createClip="handleCreateClip"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useTranscriptionStore } from '../stores/transcription'
import VideoPlayer from '../components/VideoPlayer.vue'
import TranscriptionEditor from '../components/TranscriptionEditor.vue'
import axios from 'axios'

const store = useTranscriptionStore()
const videoPlayerRef = ref(null)
const currentTime = ref(0)
const outputFormat = ref('mp4')
const isConverting = ref(false)

const videoUrl = computed(() => {
  if (store.currentJob?.path) {
    return store.currentJob.path
  }
  return null
})

const handleTimeUpdate = (time) => {
  currentTime.value = time
}

const handleSegmentChange = (segment) => {
  // Auto-scroll to active segment in editor
}

const handleEditorSegmentClick = (segment) => {
  videoPlayerRef.value?.seekTo(segment.start)
  videoPlayerRef.value?.playSegment(segment.start, segment.end)
}

const handleSegmentsUpdate = (updatedSegments) => {
  store.currentJob.segments = updatedSegments
}

const handleCreateClip = ({ start, end }) => {
  console.log('Creating clip from', start, 'to', end)
  // Implement clip creation logic
}

const convertFormat = async () => {
  if (!store.currentJob?.path) return
  
  isConverting.value = true
  try {
    const response = await axios.post('/api/convert', {
      inputPath: store.currentJob.path,
      outputFormat: outputFormat.value
    })
    console.log('Converted:', response.data)
  } catch (error) {
    console.error('Conversion failed:', error)
  } finally {
    isConverting.value = false
  }
}
</script>
