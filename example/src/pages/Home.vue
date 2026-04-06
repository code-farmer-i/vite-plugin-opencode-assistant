<template>
  <div class="page home">
    <h1>Home - Counter Demo</h1>
    <div class="card">
      <button class="demo-button" @click="count++">
        Count: {{ count }}
      </button>
      <p>
        Try asking the AI assistant to change the button color or add new features!
      </p>
    </div>
    
    <TestComponent title="Vue Component Test" :initial-value="10" />
    
    <div class="element-plus-section">
      <h2>Element Plus 组件测试</h2>
      
      <div class="demo-row">
        <el-button type="primary" @click="handleClick">Primary Button</el-button>
        <el-button type="success">Success</el-button>
        <el-button type="warning">Warning</el-button>
        <el-button type="danger">Danger</el-button>
      </div>
      
      <div class="demo-row">
        <el-input v-model="inputValue" placeholder="请输入内容" style="width: 200px" />
        <el-select v-model="selectValue" placeholder="请选择" style="width: 150px">
          <el-option label="选项一" value="1" />
          <el-option label="选项二" value="2" />
          <el-option label="选项三" value="3" />
        </el-select>
      </div>
      
      <div class="demo-row">
        <el-switch v-model="switchValue" />
        <el-rate v-model="rateValue" />
      </div>
      
      <div class="demo-row">
        <el-tag>Tag 1</el-tag>
        <el-tag type="success">Tag 2</el-tag>
        <el-tag type="warning">Tag 3</el-tag>
        <el-tag type="danger">Tag 4</el-tag>
      </div>
      
      <div class="demo-row">
        <el-menu :default-active="activeMenu" mode="horizontal" @select="handleMenuSelect">
          <el-menu-item index="1">首页</el-menu-item>
          <el-sub-menu index="2">
            <template #title>产品</template>
            <el-menu-item index="2-1">产品列表</el-menu-item>
            <el-sub-menu index="2-2">
            <template #title>产品分类</template>
            <el-menu-item index="2-2-1">电子产品</el-menu-item>
            <el-menu-item index="2-2-2">家居用品</el-menu-item>
          </el-sub-menu>
            <el-menu-item index="2-3">新品推荐</el-menu-item>
          </el-sub-menu>
          <el-menu-item index="3">关于我们</el-menu-item>
          <el-sub-menu index="4">
            <template #title>更多</template>
            <el-menu-item index="4-1">选项1</el-menu-item>
            <el-menu-item index="4-2">选项2</el-menu-item>
            <el-menu-item index="4-3">选项3</el-menu-item>
          </el-sub-menu>
        </el-menu>
      </div>
    </div>
    
    <div class="instructions">
      <h2>How to use:</h2>
      <ol>
        <li>Click the <strong>+</strong> button in the bottom-right corner</li>
        <li>Chat with the AI assistant</li>
        <li>Ask it to modify your code (e.g., "Change the button color to red")</li>
        <li>See the changes in real-time!</li>
      </ol>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import TestComponent from '../components/TestComponent.vue'

const count = ref(0)
const inputValue = ref('')
const selectValue = ref('')
const switchValue = ref(true)
const rateValue = ref(3)
const activeMenu = ref('1')

function handleClick() {
  console.log('Element Plus button clicked')
}

function handleMenuSelect(index) {
  console.log('Menu selected:', index)
}
</script>

<style scoped>
.home {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  min-height: 100vh;
}

.home .card {
  padding: 2.5rem;
  margin: 2rem 0;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.15) 100%);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  box-shadow: 
    0 8px 32px rgba(99, 102, 241, 0.2),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.home .card p {
  color: rgba(255, 255, 255, 0.9);
  font-size: 1.05rem;
  line-height: 1.6;
  margin-top: 1rem;
}

.home .demo-button {
  padding: 14px 28px;
  font-size: 16px;
  background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%);
  color: white;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 1rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  box-shadow: 
    0 4px 15px rgba(99, 102, 241, 0.4),
    0 0 0 1px rgba(255, 255, 255, 0.1) inset;
}

.home .demo-button:hover {
  background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%);
  transform: translateY(-3px);
  box-shadow: 
    0 8px 25px rgba(99, 102, 241, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.15) inset;
}

.home .demo-button:active {
  transform: translateY(-1px);
}

.home .element-plus-section {
  margin: 2.5rem 0;
  padding: 2rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.home .element-plus-section h2 {
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 1.5rem;
  font-weight: 600;
}

.home .demo-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin: 1.5rem 0;
  flex-wrap: wrap;
}

.home .instructions {
  text-align: left;
  padding: 2rem;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(168, 85, 247, 0.15) 100%);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  margin-top: 2.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 8px 32px rgba(99, 102, 241, 0.15);
}

.home .instructions h2 {
  margin-top: 0;
  color: white;
  margin-bottom: 1rem;
  font-weight: 600;
}

.home .instructions ol {
  color: rgba(255, 255, 255, 0.9);
  line-height: 2;
  padding-left: 1.5rem;
}

.home .instructions li {
  margin-bottom: 0.5rem;
}

.home .instructions strong {
  color: #a855f7;
  font-weight: 600;
}
</style>