<template>
  <div class="input-group">
    <input 
      :type="inputType" 
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
      :name="name" 
      :id="id" 
      :placeholder="placeholder"
      class="form-control form-control-lg" 
      :required="required"
    >
    <button 
      @click="changeInputType" 
      class="btn btn-light" 
      type="button" 
      id="button-addon2"
    >
      <i class="align-middle" 
        :class="inputType === 'text' ? 'ri-eye-line' : 'ri-eye-off-line'"
      ></i>
    </button>
  </div>
</template>

<script>
import { ref } from 'vue';

export default {
  props: {
    modelValue: {
      type: String,
      default: '',
    },
    name: {
      type: String,
      default: '',
    },
    id: {
      type: String,
      default: '',
    },
    placeholder: {
      type: String,
      default: '',
    },
    required: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:modelValue'],
  setup() {
    const inputType = ref('password');

    const changeInputType = () => {
      inputType.value = inputType.value === 'text' ? 'password' : 'text';
    };

    return {
      inputType,
      changeInputType
    };
  },
};
</script>