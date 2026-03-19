# EssealDatePicker

A lightweight, dependency-free date picker that works seamlessly with vanilla HTML, React, Vue, Angular, and other JavaScript frameworks.

## ✨ Features

- **Zero Dependencies** - Pure JavaScript, no external libraries required
- **Framework Agnostic** - Works with React, Vue, Angular, and vanilla JS
- **React-Safe** - Properly triggers React's synthetic event system
- **Lightweight** - ~8KB minified
- **Range Selection** - Support for both single date and date range selection
- **Customizable** - Easy theming with color options
- **Accessible** - ARIA labels and keyboard support
- **Localized** - Automatic locale detection for date formatting

## 📦 Installation

```bash
npm install esseal-date-picker
```

Or use via CDN:

```html
<script type="module">
  import EssealDatePicker from "https://cdn.jsdelivr.net/npm/esseal-date-picker/dist/esseal-date-picker.esm.js";
</script>
```

## 🚀 Quick Start

### Vanilla HTML/JavaScript

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Date Picker Demo</title>
  </head>
  <body>
    <input type="text" id="myDatePicker" placeholder="Select a date" />

    <script type="module">
      import EssealDatePicker from "./esseal-date-picker.js";

      new EssealDatePicker("#myDatePicker", {
        onChange: (date) => {
          console.log("Selected date:", date);
        },
      });
    </script>
  </body>
</html>
```

### React

```jsx
import { useEffect, useRef } from "react";
import EssealDatePicker from "esseal-date-picker";

function DatePickerComponent() {
  const inputRef = useRef(null);
  const pickerRef = useRef(null);

  useEffect(() => {
    // Initialize the date picker
    pickerRef.current = new EssealDatePicker(inputRef.current, {
      primaryColor: "#3b82f6",
      onChange: (date) => {
        console.log("Selected:", date);
      },
    });

    // Cleanup on unmount
    return () => {
      if (pickerRef.current) {
        pickerRef.current.destroy();
      }
    };
  }, []);

  return (
    <div>
      <label htmlFor="date-picker">Select Date:</label>
      <input
        ref={inputRef}
        type="text"
        id="date-picker"
        placeholder="Click to select date"
        readOnly
      />
    </div>
  );
}

export default DatePickerComponent;
```

### Vue 3

```vue
<template>
  <div>
    <label for="date-picker">Select Date:</label>
    <input
      ref="dateInput"
      type="text"
      id="date-picker"
      placeholder="Click to select date"
      readonly
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import EssealDatePicker from "esseal-date-picker";

const dateInput = ref(null);
let picker = null;

onMounted(() => {
  picker = new EssealDatePicker(dateInput.value, {
    onChange: (date) => {
      console.log("Selected:", date);
    },
  });
});

onUnmounted(() => {
  if (picker) {
    picker.destroy();
  }
});
</script>
```

### Angular

```typescript
import {
  Component,
  ElementRef,
  ViewChild,
  OnInit,
  OnDestroy,
} from "@angular/core";
import EssealDatePicker from "esseal-date-picker";

@Component({
  selector: "app-date-picker",
  template: `
    <div>
      <label for="date-picker">Select Date:</label>
      <input
        #dateInput
        type="text"
        id="date-picker"
        placeholder="Click to select date"
        readonly
      />
    </div>
  `,
})
export class DatePickerComponent implements OnInit, OnDestroy {
  @ViewChild("dateInput", { static: true }) dateInput!: ElementRef;
  private picker: any;

  ngOnInit() {
    this.picker = new EssealDatePicker(this.dateInput.nativeElement, {
      onChange: (date: Date) => {
        console.log("Selected:", date);
      },
    });
  }

  ngOnDestroy() {
    if (this.picker) {
      this.picker.destroy();
    }
  }
}
```

## 📖 API Reference

### Constructor

```javascript
new EssealDatePicker(target, options);
```

**Parameters:**

- `target` (string | HTMLInputElement) - CSS selector or DOM element
- `options` (object) - Configuration options

### Options

| Option         | Type                         | Default                                      | Description                                         |
| -------------- | ---------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `mode`         | `'single'` \| `'range'`      | `'single'`                                   | Selection mode                                      |
| `locale`       | `string`                     | `navigator.language`                         | Locale for date formatting (e.g., 'en-US', 'fr-FR') |
| `minDate`      | `Date` \| `string` \| `null` | `null`                                       | Minimum selectable date                             |
| `maxDate`      | `Date` \| `string` \| `null` | `null`                                       | Maximum selectable date                             |
| `primaryColor` | `string`                     | `'#3b82f6'`                                  | Primary color for selections (must be hex format)   |
| `textColor`    | `string`                     | `'#1f2937'`                                  | Text color for the calendar                         |
| `zIndex`       | `number`                     | `9999`                                       | Z-index for the calendar popup                      |
| `format`       | `function`                   | `(date) => date.toLocaleDateString('en-CA')` | Custom date formatter function                      |
| `onChange`     | `function` \| `null`         | `null`                                       | Callback when date is selected                      |

### Methods

#### `open()`

Opens the date picker calendar.

```javascript
picker.open();
```

#### `close()`

Closes the date picker calendar.

```javascript
picker.close();
```

#### `destroy()`

Removes all event listeners and DOM elements. **Always call this when removing the picker** (especially important in React/Vue/Angular).

```javascript
picker.destroy();
```

## 🎨 Customization Examples

### Custom Color Theme

```javascript
new EssealDatePicker("#date-picker", {
  primaryColor: "#10b981", // Green theme
  textColor: "#374151",
});
```

### Date Range Selection

```javascript
new EssealDatePicker("#dateRange", {
  mode: "range",
  onChange: (range) => {
    console.log("Start:", range.start);
    console.log("End:", range.end);
  },
});
```

### Date Restrictions

```javascript
new EssealDatePicker("#date-picker", {
  minDate: new Date(2024, 0, 1), // January 1, 2024
  maxDate: new Date(2024, 11, 31), // December 31, 2024
  onChange: (date) => {
    console.log("Selected date within 2024:", date);
  },
});
```

### Custom Date Format

```javascript
new EssealDatePicker("#date-picker", {
  format: (date) => {
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();
    return `${month}/${day}/${year}`; // MM/DD/YYYY
  },
});
```

### Localized Calendar

```javascript
new EssealDatePicker("#date-picker", {
  locale: "fr-FR", // French locale
  format: (date) => date.toLocaleDateString("fr-FR"),
});
```

## 🔧 Advanced Usage

### Multiple Pickers on One Page

```javascript
// Each instance is independent
const picker1 = new EssealDatePicker("#date1", {
  primaryColor: "#3b82f6",
});

const picker2 = new EssealDatePicker("#date2", {
  primaryColor: "#ef4444",
});

const picker3 = new EssealDatePicker("#date3", {
  mode: "range",
  primaryColor: "#10b981",
});
```

### Programmatic Control

```javascript
const picker = new EssealDatePicker("#date-picker");

// Open programmatically
document.querySelector("#openBtn").addEventListener("click", () => {
  picker.open();
});

// Close programmatically
document.querySelector("#closeBtn").addEventListener("click", () => {
  picker.close();
});
```

### Working with Forms

```javascript
const form = document.querySelector("#myForm");
const picker = new EssealDatePicker("#dateInput", {
  onChange: (date) => {
    // The input value is automatically updated
    // Form submission will include the formatted date
    console.log("Form will submit:", form.dateInput.value);
  },
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const formData = new FormData(form);
  console.log("Date submitted:", formData.get("dateInput"));
});
```

## ⚠️ Important Notes

### Color Format

The `primaryColor` option **must be in hexadecimal format** (`#RRGGBB` or `#RGB`). RGB and HSL formats are not currently supported.

✅ Valid:

- `#3b82f6`
- `#f00`
- `#FF5733`

❌ Invalid:

- `rgb(59, 130, 246)`
- `hsl(217, 91%, 60%)`

### React Integration

Always use the `destroy()` method in cleanup functions to prevent memory leaks:

```jsx
useEffect(() => {
  const picker = new EssealDatePicker(inputRef.current);

  return () => picker.destroy(); // ✅ Critical for preventing memory leaks
}, []);
```

### Read-Only Input Recommendation

It's recommended to set the input as `readonly` to prevent manual typing:

```html
<input type="text" id="date-picker" readonly />
```

## 🎯 Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Opera (latest)

**IE11 is not supported** (uses modern JavaScript features like `classList`, `dataset`, etc.)

## 📄 License

MIT License - feel free to use in personal and commercial projects.

## 📝 Changelog

### v1.0.0

- Complete rewrite with React-safe event handling
- Added range selection mode
- Improved performance with DocumentFragment rendering
- Better accessibility support
- TypeScript version (coming soon)

---

**Made with ❤️ for developers who need a simple, reliable date picker**
