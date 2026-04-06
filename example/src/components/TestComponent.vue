<template>
  <div class="test-component">
    <h2>Vue Component Test</h2>
    <p class="description">This is a test Vue component for element selection.</p>
    
    <div class="counter-section">
      <button class="counter-btn" @click="decrement">-</button>
      <span class="counter-value">{{ count }}</span>
      <button class="counter-btn" @click="increment">+</button>
    </div>

    <div class="info-section">
      <p>Component Name: <strong>{{ componentName }}</strong></p>
      <p>Click Count: <strong>{{ clickCount }}</strong></p>
      <p>Last Action: <strong>{{ lastAction }}</strong></p>
    </div>

    <div class="props-section">
      <h3>Props:</h3>
      <p>Title: {{ title }}</p>
      <p>Initial Value: {{ initialValue }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: 'Test Component',
    validator: (value) => {
      if (value.length > 50) {
        console.warn(`Title cannot exceed 50 characters. Current length: ${value.length}`)
        return false
      }
      return true
    }
  },
  initialValue: {
    type: Number,
    default: 0
  }
})

const count = ref(props.initialValue)
const clickCount = ref(0)
const lastAction = ref('None')

const componentName = computed(() => 'TestComponent')

function increment() {
  count.value++
  clickCount.value++
  lastAction.value = 'Increment'
}

function decrement() {
  count.value--
  clickCount.value++
  lastAction.value = 'Decrement'
}
</script>

<style scoped>
.test-component {
  padding: 24px;
  border: 1px solid rgba(99, 102, 241, 0.3);
  border-radius: 16px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%);
  backdrop-filter: blur(12px);
  max-width: 400px;
  margin: 20px auto;
  box-shadow: 
    0 8px 32px rgba(99, 102, 241, 0.15),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.test-component h2 {
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 10px;
  font-weight: 600;
}

.description {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 20px;
  font-size: 0.95rem;
}

.counter-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  margin: 20px 0;
}

.counter-btn {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
  color: white;
  font-size: 22px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
}

.counter-btn:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
}

.counter-btn:active {
  transform: scale(1.05);
}

.counter-value {
  font-size: 36px;
  font-weight: bold;
  color: white;
  min-width: 60px;
  text-align: center;
  text-shadow: 0 2px 10px rgba(99, 102, 241, 0.3);
}

.info-section {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.15) 100%);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 16px;
  border-radius: 12px;
  margin: 15px 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.info-section p {
  color: rgba(255, 255, 255, 0.85);
  margin: 8px 0;
  font-size: 0.95rem;
}

.info-section strong {
  color: #a5b4fc;
}

.props-section {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.15) 100%);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.props-section h3 {
  margin-top: 0;
  color: rgba(255, 255, 255, 0.95);
  font-weight: 600;
  margin-bottom: 12px;
}

.props-section p {
  color: rgba(255, 255, 255, 0.85);
  margin: 6px 0;
  font-size: 0.9rem;
}
</style>
