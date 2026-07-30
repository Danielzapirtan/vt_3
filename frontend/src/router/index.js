import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'
import Editor from '../views/Editor.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/editor', component: Editor }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
