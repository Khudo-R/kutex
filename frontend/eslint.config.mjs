import antfu from '@antfu/eslint-config'

export default antfu({
  gitignore: true,
  ignores: ['wailsjs/**'],
  vue: true,
  typescript: true,
  stylistic: {
    indent: 2,
    quotes: 'single',
    braceStyle: 'stroustrup',
    semi: false,
  },
})
