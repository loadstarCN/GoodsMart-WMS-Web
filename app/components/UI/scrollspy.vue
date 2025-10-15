<!-- components/ScrollSpy.vue -->

<template>
    <div v-scroll-spy="{ selector: '.scrollspy-example-2', offset: 50 }">
        <slot></slot>
    </div>
</template>

<script>
import { defineComponent } from 'vue';
import ScrollSpy from 'vue3-scroll-spy';

export default defineComponent({
    directives: {
        'scroll-spy': ScrollSpy,
    },
});
</script>