<template>
  <div class="page settings">
    <h1>Settings</h1>
    <p class="page-desc">Application settings. Ask the AI to add new settings options or change the layout!</p>

    <div class="settings-list">
      <div class="setting-item">
        <div class="setting-info">
          <h3>Theme</h3>
          <p>Choose your preferred color theme</p>
        </div>
        <select 
          v-model="settings.theme"
          class="setting-select"
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="auto">Auto</option>
        </select>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h3>Notifications</h3>
          <p>Enable or disable notifications</p>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            v-model="settings.notifications"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h3>Language</h3>
          <p>Select your preferred language</p>
        </div>
        <select 
          v-model="settings.language"
          class="setting-select"
        >
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
        </select>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h3>Font Size</h3>
          <p>Adjust the text size</p>
        </div>
        <select 
          v-model="settings.fontSize"
          class="setting-select"
        >
          <option value="small">Small</option>
          <option value="medium">Medium</option>
          <option value="large">Large</option>
        </select>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h3>Auto Save</h3>
          <p>Automatically save your changes</p>
        </div>
        <label class="toggle">
          <input
            type="checkbox"
            v-model="settings.autoSave"
          />
          <span class="toggle-slider"></span>
        </label>
      </div>
    </div>

    <div class="settings-actions">
      <button class="btn btn-primary">Save Changes</button>
      <button class="btn btn-secondary">Reset to Defaults</button>
    </div>
  </div>
</template>

<script setup>
import { reactive } from 'vue'

const settings = reactive({
  theme: 'light',
  notifications: true,
  language: 'en',
  fontSize: 'medium',
  autoSave: true
})
</script>

<style src="./Settings.css"></style>
