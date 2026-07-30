<template>
  <div class="min-h-screen">
    <nav class="glass-effect m-4 p-4">
      <div class="max-w-7xl mx-auto flex justify-between items-center">
        <router-link to="/" class="text-2xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
          🎥 VideoTranscriber
        </router-link>
        <div class="flex gap-4">
          <router-link to="/" class="text-gray-300 hover:text-white transition-colors">Home</router-link>
          <router-link to="/editor" class="text-gray-300 hover:text-white transition-colors">Editor</router-link>
        </div>
      </div>
    </nav>
    <router-view />
  </div>
</template>

<script setup>
import { RouterLink, RouterView } from 'vue-router'
</script>
