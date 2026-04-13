/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                screen: 'var(--color-bg-primary)',
                surface: {
                    DEFAULT: 'var(--color-bg-card)',
                    elevated: 'var(--color-sidebar-bg)',
                },
                primary: {
                    DEFAULT: 'var(--color-accent-primary)',
                    hover: 'var(--color-accent-primary-hover)',
                },
                success: 'var(--color-success)',
                danger: 'var(--color-error)',
                active: 'var(--color-accent-primary)',
            },
            fontFamily: {
                sans: ['Inter', 'Outfit', 'sans-serif'],
            },
        },
    },
    plugins: [],
}
