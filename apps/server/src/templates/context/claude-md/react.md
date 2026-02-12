## React Patterns

This project uses React {{reactVersion}} with {{metaFramework}}.

### Component Conventions

- Use functional components with hooks
- Prefer composition over inheritance
- Co-locate tests with components
- Use TypeScript for all components (`.tsx`)

### State Management

- Local state: `useState` / `useReducer`
- Server state: TanStack Query or SWR
- Global state: Zustand or React Context (avoid prop drilling)

### Styling

{{#hasTailwind}}

- Use Tailwind CSS utility classes
- Extract repeated patterns into components, not utility functions
- Use `cn()` helper for conditional classes
  {{/hasTailwind}}
  {{#hasShadcn}}
- Use shadcn/ui components as the base component library
- Customize via the theme in `components.json`
  {{/hasShadcn}}
