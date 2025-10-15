<template>
  <div>
    <sun-editor v-model="editorContent" :setOptions="editorOptions" />
    <div>
      <h2>Editor Content:</h2>
      <div v-html="editorContent"></div>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue';
import SunEditor from 'vue3-suneditor';
import 'suneditor/dist/css/suneditor.min.css';

export default {
  name: 'MyEditor',
  components: {
    SunEditor,
  },
  setup() {
    const editorContent = ref("<p>Hello, world!</p>");

    const editorOptions = {
      height: 400, // Set editor height
      buttonList: [
        ['bold', 'underline', 'italic', 'strike'],
        ['font', 'fontSize', 'formatBlock'],
        ['align', 'list', 'lineHeight'],
        ['link', 'image', 'video'],
        ['undo', 'redo', 'removeFormat'],
      ],
    };

    return {
      editorContent,
      editorOptions,
    };
  },
};
</script>

<style scoped>
/* Optional: you can add custom styles for the editor */
</style>