# 🍄 Amanita.js: The Magical Web Components Framework

Ever wished your web components could talk to each other like mushrooms in a forest's underground network? Meet Amanita.js, the framework that turns your components into a thriving ecosystem of interconnected elements!

## What's the Magic? 🪄

Amanita.js is like a mycelium network for your web components - it lets them communicate effortlessly through a powerful pub/sub system. Just like how mushrooms share nutrients underground, your components can share data through named topics using simple, intuitive refs.

Amanita.js also lets your components teleport their logic to web workers or even to the server with ease! It's like giving your components a magic portal - just add `server="true"` to your scheduler, and *poof* - your worker component is now running on the server.

## Features That'll Get You Hooked 🎣

- 🔌 Plug-and-play pub/sub system
- 🎯 Simple ref-based targeting
- 🌐 Seamless component communication
- 🚀Easy worker offloading (for heavy compute or canvas operations)
- ⚡ Server-side execution with one attribute
- 🧙‍♂️ Transparent worker/server execution

Don't let your components live in isolation - let them join the fungal... err, functional revolution with Amanita.js!

*Warning: Unlike its namesake, this framework won't make you hallucinate. But it might make you see web components in a whole new light!* 🍄✨

## Quick Start 🚀

Let's create a simple temperature converter that shows how components can communicate. One component will publish the temperature, and others will subscribe to convert it:

```html
<temperature-app>
  <!-- Publisher: Updates temperature on slider move -->
  <temp-input name="temp-source">
    <input name="user-input" type="range" min="0" max="100" value="20">
  </temp-input>

  <!-- Subscribers: Convert and display temperature -->
  <temp-display sub="/temp-source/" unit="°F"></temp-display>
  <temp-display sub="/temp-source/" unit="K"></temp-display>
</temperature-app>
```

```javascript
// Temperature Input Component
class TempInput extends A(HTMLElement) {
  // Subscribe to input events and publish temperature
  'user-input/@input'(e) {
    this.pub('value', Number(e.target.value));
  }
}
A.define('temp-input', TempInput);

// Temperature Display Component
class TempDisplay extends A(HTMLElement) {
  // Auto-subscription using ref as method name
  '/temp-source/'(celsius) {
    const unit = this.attr('unit');
    const converted = this.convert(celsius, unit);
    this.textContent = `${converted.toFixed(1)}${unit}`;
  }

  convert(celsius, unit) {
    switch(unit) {
      case '°F': return (celsius * 9/5) + 32;
      case 'K': return celsius + 273.15;
      default: return celsius;
    }
  }
}
A.define('temp-display', TempDisplay);
```

*Now that's what we call a magic mushroom network!* 🍄
