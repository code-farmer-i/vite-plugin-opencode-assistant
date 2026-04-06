<template>
  <div class="page list">
    <h1>Todo List</h1>
    <p class="page-desc">A simple todo list. Ask the AI to add features like filtering, sorting, or drag-and-drop!</p>
    
    <div class="stats">
      <span>{{ completedCount }} of {{ items.length }} completed</span>
      <div class="progress-bar">
        <div 
          class="progress-fill" 
          :style="{ width: `${(completedCount / items.length) * 100}%` }"
        />
      </div>
    </div>

    <form @submit.prevent="addItem" class="add-form">
      <input
        type="text"
        v-model="newItem"
        placeholder="Add a new task..."
        class="add-input"
      />
      <button type="submit" class="add-button">Add</button>
    </form>

    <ul class="todo-list">
      <li 
        v-for="item in items" 
        :key="item.id" 
        :class="['todo-item', { completed: item.completed }]"
      >
        <label class="todo-checkbox">
          <input
            type="checkbox"
            :checked="item.completed"
            @change="toggleItem(item.id)"
          />
          <span class="checkmark"></span>
        </label>
        <span class="todo-title">{{ item.title }}</span>
        <button 
          class="delete-button"
          @click="deleteItem(item.id)"
        >
          ×
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const initialItems = [
  { id: 1, title: 'Learn Vue', completed: true },
  { id: 2, title: 'Build a project', completed: false },
  { id: 3, title: 'Deploy to production', completed: false },
  { id: 4, title: 'Write documentation', completed: false },
  { id: 5, title: 'Add tests', completed: false },
]

const items = ref([...initialItems])
const newItem = ref('')

const completedCount = computed(() => 
  items.value.filter(item => item.completed).length
)

function toggleItem(id) {
  const item = items.value.find(i => i.id === id)
  if (item) {
    item.completed = !item.completed
  }
}

function addItem() {
  if (!newItem.value.trim()) return
  
  items.value.push({
    id: Date.now(),
    title: newItem.value,
    completed: false
  })
  newItem.value = ''
}

function deleteItem(id) {
  items.value = items.value.filter(item => item.id !== id)
}
</script>

<style src="./List.css"></style>
