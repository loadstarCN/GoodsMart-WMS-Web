<template>
  <!-- Tiptap editor with v-model and extensions passed in -->
  <ElementTiptap v-model:content="content" :extensions="extensions" />
</template>

<script setup>
import { ref, defineProps } from 'vue';
import { ElementTiptap } from 'element-tiptap-vue3-fixed';
import 'element-tiptap-vue3-fixed/lib/style.css';

// Import Tiptap extensions needed for the editor
import {
  Doc,
  Text,
  Paragraph,
  Heading,
  Bold,
  Underline,
  Italic,
  Strike,
  BulletList,
  OrderedList,
  Link,
  Image,
  Iframe,
  CodeBlock,
  Blockquote,
  TaskList,
  TextAlign,
  LineHeight,
  HorizontalRule,
  HardBreak,
  History,
  Table,
  FormatClear,
  Color,
  Highlight,
  Print,
  Fullscreen,
  SelectAll,
  CodeView,
  Gapcursor,
  Dropcursor,
} from 'element-tiptap-vue3-fixed';

// Define the props for the component, ensuring `content` is a required string
const props = defineProps({
  content: {
    type: String,  // Ensure content is a string
    required: true  // Set the prop as required
  }
});

// Extensions for Tiptap editor
const extensions = [
  Doc,
  Text,
  Paragraph,
  Heading.configure({ level: 5 }),
  Bold.configure({ bubble: true }),
  Underline.configure({ bubble: true, menubar: false }),
  Italic,
  Strike,
  BulletList,
  OrderedList,
  Link,
  Image,
  Iframe,
  CodeBlock,
  Blockquote,
  TaskList,
  TextAlign,
  LineHeight,
  HorizontalRule,
  HardBreak,
  History,
  Table,
  FormatClear,
  Color,
  Highlight,
  Print,
  Fullscreen,
  SelectAll,
  CodeView,
  Gapcursor,
  Dropcursor,
];
const content = ref(props.content);
</script>

<style scoped></style>
