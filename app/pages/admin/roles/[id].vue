<script setup lang="ts">
import RoleManager from "~/components/admin/RoleManager.vue"
definePageMeta({layout:"admin",middleware:"admin"})
</script>
<template><RoleManager :role-id="Number($route.params.id)"/></template>
