<script lang="ts">

export default {
  name: 'CustomCard',
  props: {
    customCardClass: String,
    cardHeaderClass: String,
    showCardHeader: { type: Boolean, default: true },
    title: String,
    cardClassBody: String,
    showCardFooter: { type: Boolean, default: false },
    cardFooterClass: String,
    cardFooter2: { type: Boolean, default: false },
    cardBodyId: String,
  }
};
</script>

<template>
  <div :class="['card custom-card', customCardClass]">
    <template v-if="showCardHeader">
      <div :class="['card-header', cardHeaderClass]">
        <div class="card-title" v-html="title"> </div>
        <slot name="showheader"></slot>
      </div>
    </template>
    <slot name="cardBodyUpperContent"></slot>
    <div :class="['card-body', cardClassBody]" :id="cardBodyId">
      <slot></slot>
    </div>
    <slot name="cardBodyDown"></slot>

    <template v-if="showCardFooter">
      <div :class="['card-footer', cardFooterClass]">
        <slot name="cardFooter"></slot>
      </div>
      <div class="card-footer" v-if="cardFooter2">
        <slot name="cardFooter2"></slot>
      </div>
    </template>
  </div>
</template>

<style scoped></style>
