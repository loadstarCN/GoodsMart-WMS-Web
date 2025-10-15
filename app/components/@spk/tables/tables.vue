<template>
  <div class="table-responsive">
    <table :class="tableClass">
      <thead :class="theadClass">
        <tr>
          <th v-for="header in headers" :key="header">{{ header }}</th>
        </tr>
      </thead>
      <tbody :class="tbodyClass">
        <tr v-for="(row, rowIndex) in rows" :key="rowIndex" :class="trClass">
          <slot name="cell" :row="row" :index="rowIndex"></slot>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script>
export default {
  props: {
    headers: {
      type: Array,
      required: true,
    },
    rows: {
      type: Array,
      required: true,
    },
    tableClass: {
      type: String,
      default: 'table text-nowrap',
    },
    theadClass: {
      type: String,
      default: '',
    },
    tbodyClass: {
      type: String,
      default: '',
    },
    trClass: {
      type: String,
      default: '',
    },
  },
};
</script>

<style scoped></style>