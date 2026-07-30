<template>
  <div class="glass-effect p-6">
    <div class="flex justify-between items-center mb-4">
      <h3 class="text-xl font-semibold">Transcription</h3>
      <div class="flex gap-2">
        <button @click="exportFormat = 'txt'" class="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600">
          Export TXT
        </button>
        <button @click="exportFormat = 'srt'" class="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600">
          Export SRT
        </button>
        <button @click="exportFormat = 'vtt'" class="px-3 py-1 bg-gray-700 rounded hover:bg-gray-600">
          Export VTT
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="mb-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search in transcription..."
        class="w-full px-4 py-2 bg-gray-800 rounded-lg border border-gray-700 
               focus:border-indigo-400 focus:outline-none text-white"
      />
    </div>

    <!-- Segments -->
    <div class="space-y-1 max-h-96 overflow-y-auto">
      <div
        v-for="(segment, index) in filteredSegments"
        :key="index"
        :class="['transcript-segment', { active: isActiveSegment(segment) }]"
        @click="handleSegmentClick(segment)"
      >
        <div class="flex justify-between items-start mb-1">
          <span class="text-xs text-gray-500">{{ formatTime(segment.start) }}</span>
          <div class="flex gap-2">
            <button
              @click.stop="editSegment(index)"
              class="text-xs text-indigo-400 hover:text-indigo-300"
            >
              Edit
            </button>
            <button
              @click.stop="deleteSegment(index)"
              class="text-xs text-red-400 hover:text-red-300"
            >
              Delete
            </button>
          </div>
        </div>
        
        <div v-if="editingIndex === index">
          <textarea
            v-model="editText"
            class="w-full bg-gray-800 rounded p-2 text-white text-sm"
            rows="3"
            @keyup.esc="saveEdit(index)"
          ></textarea>
          <div class="flex gap-2 mt-1">
            <button @click="saveEdit(index)" class="text-xs text-green-400">Save</button>
            <button @click="cancelEdit" class="text-xs text-gray-400">Cancel</button>
          </div>
        </div>
        <p v-else class="text-sm text-gray-300">{{ segment.text }}</p>
      </div>
    </div>

    <!-- Cutting tools -->
    <div class="mt-4 pt-4 border-t border-gray-700">
      <h4 class="text-lg font-semibold mb-2">Clip Creator</h4>
      <div class="flex gap-4 items-end">
        <div>
          <label class="text-sm text-gray-400">Start Time</label>
          <input
            v-model="clipStart"
            type="text"
            placeholder="0:00"
            class="w-24 px-3 py-2 bg-gray-800 rounded border border-gray-700 text-white text-sm"
          />
        </div>
        <div>
          <label class="text-sm text-gray-400">End Time</label>
          <input
            v-model="clipEnd"
            type="text"
            placeholder="0:30"
            class="w-24 px-3 py-2 bg-gray-800 rounded border border-gray-700 text-white text-sm"
          />
        </div>
        <button
          @click="createClip"
          class="px-4 py-2 bg-indigo-600 rounded hover:bg-indigo-700 text-sm"
        >
          Create Clip
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  segments: Array,
  currentTime: Number
})

const emit = defineEmits(['segmentClick', 'segmentsUpdate'])

const editingIndex = ref(-1)
const editText = ref('')
const searchQuery = ref('')
const clipStart = ref('')
const clipEnd = ref('')
const exportFormat = ref('txt')

const filteredSegments = computed(() => {
  if (!props.segments) return []
  if (!searchQuery.value) return props.segments
  
  return props.segments.filter(seg =>
    seg.text.toLowerCase().includes(searchQuery.value.toLowerCase())
  )
})

const isActiveSegment = (segment) => {
  return props.currentTime >= segment.start && props.currentTime <= segment.end
}

const handleSegmentClick = (segment) => {
  emit('segmentClick', segment)
}

const editSegment = (index) => {
  editingIndex.value = index
  editText.value = filteredSegments.value[index].text
}

const saveEdit = (index) => {
  if (editText.value.trim()) {
    const updatedSegments = [...props.segments]
    updatedSegments[index] = { ...updatedSegments[index], text: editText.value.trim() }
    emit('segmentsUpdate', updatedSegments)
  }
  editingIndex.value = -1
}

const cancelEdit = () => {
  editingIndex.value = -1
}

const deleteSegment = (index) => {
  const updatedSegments = props.segments.filter((_, i) => i !== index)
  emit('segmentsUpdate', updatedSegments)
}

const createClip = () => {
  const start = parseTimeToSeconds(clipStart.value)
  const end = parseTimeToSeconds(clipEnd.value)
  if (start !== null && end !== null && end > start) {
    emit('createClip', { start, end })
  }
}

const parseTimeToSeconds = (timeStr) => {
  const parts = timeStr.split(':')
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  }
  return null
}

const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

const exportTranscription = () => {
  if (!props.segments) return
  
  let content = ''
  switch (exportFormat.value) {
    case 'txt':
      content = props.segments.map(seg => seg.text).join('\n')
      break
    case 'srt':
      content = props.segments.map((seg, i) => {
        return `${i + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}\n`
      }).join('\n')
      break
    case 'vtt':
      content = 'WEBVTT\n\n' + props.segments.map((seg, i) => {
        return `${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n${seg.text}\n`
      }).join('\n')
      break
  }
  
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `transcription.${exportFormat.value}`
  a.click()
}

const formatSrtTime = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
}

const formatVttTime = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 1000)
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`
}
</script>
