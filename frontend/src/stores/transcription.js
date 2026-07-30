import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import axios from 'axios'

export const useTranscriptionStore = defineStore('transcription', () => {
  const currentJob = ref(null)
  const transcriptions = ref([])
  const isProcessing = ref(false)
  const wsConnection = ref(null)
  const progress = ref({})

  const connectWebSocket = () => {
    const ws = new WebSocket('ws://localhost:3001')
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'progress') {
        progress.value = data
        if (data.status === 'completed' && data.segments) {
          currentJob.value.segments = data.segments
        }
      }
    }

    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000)
    }

    wsConnection.value = ws
  }

  const uploadAndTranscribe = async (file) => {
    isProcessing.value = true
    const jobId = Math.random().toString(36).substr(2, 9)
    
    const formData = new FormData()
    formData.append('file', file)
    formData.append('jobId', jobId)

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })

      currentJob.value = {
        ...response.data,
        segments: []
      }

      pollTranscriptionStatus(jobId)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }

  const downloadFromUrl = async (url) => {
    isProcessing.value = true
    
    try {
      const response = await axios.post('/api/download', { url })
      currentJob.value = {
        ...response.data,
        segments: []
      }

      pollTranscriptionStatus(response.data.jobId)
    } catch (error) {
      console.error('Download failed:', error)
    }
  }

  const pollTranscriptionStatus = async (jobId) => {
    const interval = setInterval(async () => {
      try {
        const response = await axios.get(`/api/transcription/${jobId}`)
        if (response.data.status === 'completed') {
          clearInterval(interval)
          isProcessing.value = false
          currentJob.value.segments = response.data.segments
          transcriptions.value.push(currentJob.value)
        }
      } catch (error) {
        console.error('Polling failed:', error)
        clearInterval(interval)
        isProcessing.value = false
      }
    }, 2000)
  }

  connectWebSocket()

  return {
    currentJob,
    transcriptions,
    isProcessing,
    progress,
    uploadAndTranscribe,
    downloadFromUrl
  }
})
