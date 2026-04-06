import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import Home from './pages/Home.vue'
import Form from './pages/Form.vue'
import List from './pages/List.vue'
import Settings from './pages/Settings.vue'
import './index.css'

const routes = [
  { path: '/', component: Home },
  { path: '/form', component: Form },
  { path: '/list', component: List },
  { path: '/settings', component: Settings },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

const app = createApp(App)
app.use(router)
app.use(ElementPlus)
app.mount('#root')
