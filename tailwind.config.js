/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./appScreens/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
    "./context/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Brand Colors
        primary: {
          DEFAULT: '#7B003F',
          dark: '#5A002E',
          light: '#9B1A4F',
        },
        secondary: '#1B2A33',
        accent: '#E64164',
        
        // Status Colors
        success: '#4CAF50',
        warning: '#FF9800',
        danger: '#F44336',
        info: '#2196F3',
        
        // Custom grays (matching your theme)
        gray: {
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#EEEEEE',
          300: '#E0E0E0',
          400: '#BDBDBD',
          500: '#9E9E9E',
          600: '#757575',
          700: '#616161',
          800: '#424242',
          900: '#212121',
        },
        
        // Text colors
        text: {
          primary: '#212121',
          secondary: '#757575',
          disabled: '#BDBDBD',
          inverse: '#FFFFFF',
        },
        
        // Background colors
        background: {
          primary: '#FFFFFF',
          secondary: '#F7F7F7',
          card: '#FFFFFF',
          disabled: '#F5F5F5',
        },
        
        // Border colors
        border: {
          light: '#E0E0E0',
          medium: '#BDBDBD',
          dark: '#757575',
        }
      },
      fontFamily: {
        'raleway': ['Raleway-Regular'],
        'raleway-medium': ['Raleway-Medium'],
        'raleway-semibold': ['Raleway-SemiBold'],
        'raleway-bold': ['Raleway-Bold'],
        'mono': ['SpaceMono'],
      },
      fontSize: {
        'xs': '12px',
        'sm': '14px',
        'base': '16px',
        'lg': '18px',
        'xl': '20px',
        '2xl': '24px',
        '3xl': '28px',
        '4xl': '32px',
        '5xl': '36px',
      },
      spacing: {
        'xs': '4px',
        'sm': '8px',
        'md': '16px',
        'lg': '24px',
        'xl': '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      borderRadius: {
        'none': '0px',
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
        '2xl': '24px',
        'full': '9999px',
      },
      boxShadow: {
        'sm': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'md': '0 2px 3px 0 rgba(0, 0, 0, 0.1)',
        'lg': '0 4px 6px 0 rgba(0, 0, 0, 0.15)',
        'xl': '0 8px 12px 0 rgba(0, 0, 0, 0.2)',
      },
    },
  },
  plugins: [],
}

