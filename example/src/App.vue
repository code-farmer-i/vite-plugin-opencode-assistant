<template>
  <div class="app">
    <nav class="navbar">
      <router-link to="/" class="nav-link" active-class="active">Home</router-link>
      <router-link to="/form" class="nav-link" active-class="active">Form</router-link>
      <router-link to="/list" class="nav-link" active-class="active">List</router-link>
      <router-link to="/settings" class="nav-link" active-class="active">Settings</router-link>
    </nav>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>

<style src="./App.css"></style>
