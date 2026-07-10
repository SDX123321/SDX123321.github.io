<script setup lang="ts">
import {
  BarChart3,
  BookOpen,
  Cpu,
  Landmark,
  LibraryBig,
  Network,
  Radio,
  Sigma,
  Waves,
} from 'lucide-vue-next'
import type { Course } from '../types/course'

defineProps<{ name: Course['icon']; size?: number }>()
const icons = {
  chart: BarChart3,
  cpu: Cpu,
  network: Network,
  wave: Waves,
  book: BookOpen,
  sigma: Sigma,
  landmark: Landmark,
  signal: Radio,
  library: LibraryBig,
}
</script>

<template><component :is="icons[name]" :size="size ?? 22" aria-hidden="true" /></template>
