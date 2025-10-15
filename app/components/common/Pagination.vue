<script lang="ts" setup>

// 路由相关 hooks
const route = useRoute()
const router = useRouter()

// Props 声明
const props = defineProps({
  pageSize: {
    type: Number,
    default: 10
  },
  currentPage: {
    type: Number,
    default: 1
  },
  total: {
    type: Number,
    default: 0
  },
  params: Object,
  can_change_page_size: {
    type: Boolean,
    default: true
  }
})

// 计算总页数
const count = computed(() => Math.ceil(props.total / props.pageSize))

// 生成页码数组
const getArr = (firstNum: number, lastNum: number) => {
  return Array.from({ length: lastNum - firstNum + 1 }, (_, i) => i + firstNum)
}

// 分页大小切换
const changePageSize = (count: number) => {
  router.push({
    path: route.path,
    query: {
      ...route.query,
      per_page: count,
      page: 1
    }
  })
}
</script>

<template>
  <div class="btn-group" v-if="can_change_page_size">
    <button type="button" class="btn btn-outline-primary dropdown-toggle rounded-pill btn-sm" data-bs-toggle="dropdown" aria-expanded="false">{{ $t('pagination.page-size') }}</button>
    <ul class="dropdown-menu">
      <li><a class="dropdown-item" href="javascript:void(0);" @click="changePageSize(10)">10</a></li>
      <li><a class="dropdown-item" href="javascript:void(0);" @click="changePageSize(20)">20</a></li>
      <li><a class="dropdown-item" href="javascript:void(0);" @click="changePageSize(50)">50</a></li>
      <li><a class="dropdown-item" href="javascript:void(0);" @click="changePageSize(100)">100</a></li>
    </ul>
  </div>

  <nav aria-label="Page navigation" class="pagination-style-3">
    <ul class="pagination mb-0" v-if="count > 1">
      
      <li :class="[{ 'disable': currentPage <= 1 }, 'page-item']" v-if="currentPage > 1">
        <nuxt-link class="page-link" 
                  :to="{ path: '', query: { ...params, page: currentPage - 1 } }">{{ $t('pagination.previous') }}</nuxt-link>
      </li>
      
      <template v-if="count <= 11">
        <li v-for="item in count" 
            :key="item"
            :class="[{ 'active': currentPage === item }, 'page-item']">
          <nuxt-link class="page-link" 
                    :to="{ path: '', query: { ...params, page: item } }">{{ item }}</nuxt-link>
        </li>
      </template>
      
      <template v-else>
            <template v-if="currentPage <= 6">
              <li :class="[{ 'active':currentPage===item?'active':''}, 'page-item' ]" v-for="item in 10">
              <nuxt-link
                        :key="item"
                        class="page-link"
                        :to="{path: '',query:{ ...params,page:item }}">{{item}}</nuxt-link>
              </li>
              <li class="page-item">
              <nuxt-link :to="{path: '',query:{ ...params,page:currentPage+9>count?count:currentPage+9}} " class="page-link">...</nuxt-link>
              </li>
              <li :class="[{ 'active':currentPage===count?'active':''}, 'page-item' ]" v-if="count>11">
              <nuxt-link :to="{path: '',query:{ ...params,page:count }}" class="page-link">{{count}}</nuxt-link>
              </li>
            </template>
            <template v-else>
              <li :class="[{ 'active':currentPage===1?'active':''}, 'page-item' ]">
                <nuxt-link :to="{path: '',query:{ ...params,page:'1'  }}" class="page-link">1</nuxt-link>
              </li>
              <li class="page-item">
                <nuxt-link :to="{path: '',query:{ ...params,page:currentPage-9<1?1:currentPage-9 }}" class="page-link">...</nuxt-link>
              </li>
              <template v-if="currentPage + 5 < count">
                <li :class="[{ 'active':currentPage===item?'active':''}, 'page-item' ]" v-for="item in getArr(currentPage-4,currentPage)">
                  <nuxt-link
                          :key="item"
                          class="page-link" 
                          :to="{path: '',query:{ ...params,page:item }}">{{item}}</nuxt-link>
                </li>
                <li :class="[{ 'active':currentPage===item?'active':''}, 'page-item' ]" v-for="item in getArr(currentPage+1,currentPage+4)">                
                  <nuxt-link
                            :key="item"
                            class="page-link" 
                            :to="{path: '',query:{ ...params,page:item }}">{{item}}</nuxt-link>
                </li>
                <li class="page-item">
                  <nuxt-link :to="{path: '',query:{ ...params,page:currentPage+9>count?count:currentPage+9 }}" class="page-link">...</nuxt-link>
                </li>
                <li :class="[{ 'active':currentPage===count?'active':''}, 'page-item' ]">
                  <nuxt-link :to="{path: '',query:{ ...params,page:count }}" class="page-link" >{{count}}</nuxt-link>
                 </li>
              </template>
              <template v-else>
                <li :class="[{ 'active':currentPage===item?'active':''}, 'page-item' ]" v-for="item in getArr(count-9,count)">
                <nuxt-link
                          :key="item"
                          class="page-link"
                          :to="{path: '',query:{ ...params,page:item }}">{{item}}</nuxt-link>
                </li>
              </template>
            </template>

      </template>

      <li :class="[{ 'disable': currentPage === count }, 'page-item']" v-if="currentPage !== count">
        <nuxt-link class="page-link text-primary"
                  :to="{ path: '', query: { ...params, page: currentPage + 1 } }">{{ $t('pagination.next') }}</nuxt-link>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
</style>