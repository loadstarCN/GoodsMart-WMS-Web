<template>
    <ClientOnly>
        <VueApexCharts :width="width || '100%' || 'apexchart'" :height="height" :type="type" :options="options"
            :series="series" />
    </ClientOnly>
</template>
<script>
import VueApexCharts from "vue3-apexcharts";
export default {
    props: ['width', 'height', 'type', 'options', 'series',],
    components: {
        VueApexCharts
    }
}
</script>