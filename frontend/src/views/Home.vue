<template>
  <div class="max-w-7xl mx-auto px-4 py-8">
    <h1 class="text-4xl font-bold text-center mb-8 bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
      Video Transcription Made Easy
    </h1>
    
    <p class="text-center text-gray-400 mb-12 max-w-2xl mx-auto">
      Upload your video or audio files, or paste a URL to get accurate transcriptions 
      powered by WhisperMLX. Edit, search, and export your transcripts with ease.
    </p>

    <VideoUploader />

    <!-- Features Grid -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16">
      <div class="glass-effect p-6 text-center">
        <div class="text-4xl mb-4">🎯</div>
        <h3 class="text-xl font-semibold mb-2">Accurate Transcription</h3>
        <p class="text-gray-400">Powered by WhisperMLX for high-quality transcriptions with timestamps</p>
      </div>
      
      <div class="glass-effect p-6 text-center">
        <div class="text-4xl mb-4">✂️</div>
        <h3 class="text-xl font-semibold mb-2">Smart Editing</h3>
        <p class="text-gray-400">Edit, search, and create clips from your transcriptions</p>
      </div>
      
      <div class="glass-effect p-6 text-center">
        <div class="text-4xl mb-4">📤</div>
        <h3 class="text-xl font-semibold mb-2">Multiple Formats</h3>
        <p class="text-gray-400">Export to TXT, SRT, VTT and more formats</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import VideoUploader from '../components/VideoUploader.vue'
</script>
