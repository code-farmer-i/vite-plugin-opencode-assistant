<template>
  <div class="page form">
    <h1>Contact Form</h1>
    <p class="page-desc">A simple contact form for testing. Ask the AI to modify the form fields or styling!</p>
    
    <div v-if="submitted" class="success-message">
      Form submitted successfully!
    </div>

    <form @submit.prevent="handleSubmit" class="contact-form">
      <div class="form-group">
        <label for="name">Name</label>
        <input
          type="text"
          id="name"
          name="name"
          v-model="formData.name"
          placeholder="Enter your name"
          required
          maxlength="50"
        />
        <span v-if="formData.name.length > 50" class="error-message">Name cannot exceed 50 characters</span>
        <span class="char-count">{{ formData.name.length }}/50</span>
      </div>

      <div class="form-group">
        <label for="email">Email</label>
        <input
          type="email"
          id="email"
          name="email"
          v-model="formData.email"
          placeholder="Enter your email"
          required
          @input="emailError = !isValidEmail(formData.email) && formData.email.length > 0"
        />
        <span v-if="emailError" class="error-message">Please enter a valid email address</span>
      </div>

      <div class="form-group">
        <label for="message">Message</label>
        <textarea
          id="message"
          name="message"
          v-model="formData.message"
          placeholder="Enter your message"
          rows="4"
          required
        ></textarea>
      </div>

      <button type="submit" class="submit-button">
        Submit
      </button>
    </form>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'

const formData = reactive({
  name: '',
  email: '',
  message: ''
})

const submitted = ref(false)
const emailError = ref(false)

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isValidEmail(email) {
  return emailRegex.test(email)
}

function handleSubmit() {
  if (formData.email && !isValidEmail(formData.email)) {
    emailError.value = true
    return
  }
  submitted.value = true
  setTimeout(() => submitted.value = false, 3000)
}
</script>

<style src="./Form.css"></style>
