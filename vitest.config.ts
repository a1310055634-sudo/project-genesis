import { defineConfig } from 'vitest/config'
import path from 'node:path'

const r = (p: string) => path.resolve(__dirname, p)

export default defineConfig({
  resolve: {
    alias: {
      '@genesis/shared': r('packages/shared/src'),
      '@genesis/core': r('packages/core/src'),
      '@genesis/simulation': r('packages/simulation/src'),
      '@genesis/psychology': r('packages/psychology/src'),
      '@genesis/economy': r('packages/economy/src'),
      '@genesis/social': r('packages/social/src'),
      '@genesis/family': r('packages/family/src'),
      '@genesis/experiments': r('packages/experiments/src'),
      '@genesis/test-utils': r('packages/test-utils/src')
    }
  },
  test: {
    include: [
      'packages/**/tests/**/*.test.ts',
      'apps/**/tests/**/*.test.ts'
    ]
  }
})
