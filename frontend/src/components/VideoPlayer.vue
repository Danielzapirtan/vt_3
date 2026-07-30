<template>
  <div class="video-container glass-effect" v-if="videoUrl">
    <video
      ref="videoPlayer"
      :src="videoUrl"
      class="w-full h-full object-contain"
      controls
      @timeupdate="handleTimeUpdate"
      @loadedmetadata="handleLoadedMetadata"
    ></video>
    
    <!-- Segment overlay -->
    <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black to-transparent p-4"
         v-if="currentSegment">
      <div class="bg-black bg-opacity-75 rounded-lg p-3">
        <p class="text-white text-sm">{{ currentSegment.text }}</p>
        <p class="text-gray-400 text-xs mt-1">
          {{ formatTime(currentSegment.start) }} - {{ formatTime(currentSegment.end) }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  videoUrl: String,
  segments: Array
})

const emit = defineEmits(['timeUpdate', 'segmentChange'])

const videoPlayer = ref(null)
const currentTime = ref(0)
const duration = ref(0)

const currentSegment = computed(() => {
  if (!props.segments) return null
  return props.segments.find(
    seg => currentTime.value >= seg.start && currentTime.value <= seg.end
  )
})

const handleTimeUpdate = () => {
  if (videoPlayer.value) {
    currentTime.value = videoPlayer.value.currentTime
    emit('timeUpdate', currentTime.value)
    if (currentSegment.value) {
      emit('segmentChange', currentSegment.value)
    }
  }
}

const handleLoadedMetadata = () => {
  if (videoPlayer.value) {
    duration.value = videoPlayer.value.duration
  }
}

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const seekTo = (time) => {
  if (videoPlayer.value) {
    videoPlayer.value.currentTime = time
  }
}

const playSegment = (startTime, endTime) => {
  if (videoPlayer.value) {
    videoPlayer.value.currentTime = startTime
    videoPlayer.value.play()
    setTimeout(() => {
      if (videoPlayer.value.currentTime >= endTime) {
        videoPlayer.value.pause()
      }
    }, (endTime - startTime) * 1000)
  }
}

defineExpose({ seekTo, playSegment })
</script>
