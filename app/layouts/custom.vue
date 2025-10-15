<template>
    <slot></slot>
</template>

<script setup>
import { switcherStore } from '@/stores/switcher';
const switcher = switcherStore(); // 直接获取响应式store实例
</script>

<style>
</style>