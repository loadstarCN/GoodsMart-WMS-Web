<template>
  <img 
    :src="processedAvatar" 
    :alt="altText" 
    :width="size" 
    :height="size"
    class="rounded-circle"
  >
</template>

<script>
export default {
  props: {
    avatar: String,
    size: {
      type: Number,
      default: 32
    },
    altText: {
      type: String,
      default: 'User avatar'
    }
  },
  computed: {
    processedAvatar() {
      return this.avatar || '/images/faces/default-avatar.png'
    }
  }
}
</script>