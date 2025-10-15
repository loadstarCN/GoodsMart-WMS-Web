<template lang="">
  <Switcher />
  <div class="page">
    <Header />
    <Sidebar />
    
        <!-- Start::app-content -->
        <div class="main-content app-content">
            <div class="container-fluid">
              <slot></slot>
            </div>
        </div>
        <!-- End::app-content -->
      <Footer />
  </div>
  <BackToTop />
</template>
<script lang="ts">

</script>
<style lang=""></style>
