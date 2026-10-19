# Full-coverage fixture: h1-h6, tables, multi-language code blocks, nested lists, blockquotes, images, horizontal rules

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

##### Heading 5

###### Heading 6

This is a paragraph with **bold**, _italic_, ~~strikethrough~~, `inline code` and a [link](https://example.com).

## Table

| Feature | Supported | Notes          |
| ------- | --------- | -------------- |
| Tables  | Yes       | With alignment |
| Images  | Yes       | See below      |
| Code    | Yes       | Multi-language |

## Code Blocks

```javascript
function greet(name) {
  const message = `Hello, ${name}!`
  console.log(message)
}
greet('WeChat')
```

```python
def greet(name: str) -> None:
    message = f"Hello, {name}!"
    print(message)

greet("WeChat")
```

```css
.md-web-cli {
  color: #0f4c81;
  font-size: 16px;
}
```

```bash
pnpm install && pnpm run build
```

```json
{ "name": "md-web-cli", "private": true }
```

## Nested Lists

- Level one
  - Level two
    - Level three
      - Level four
  - Back to level two
- Ordered inside unordered
  1. First
  2. Second
     1. Nested first
     2. Nested second

1. Ordered level one
   1. Ordered level two
      1. Ordered level three

## Blockquotes

> A single-level blockquote with **emphasis**.

> First level
>
> > Second level
> >
> > > Third level

## Images

![Fixture landscape](https://example.com/images/fixture-landscape.png)

![Fixture portrait](https://example.com/images/fixture-portrait.png 'Portrait with title')

## Horizontal Rules

---

---

---

## Closing

The fixture ends here. Tickets 04/05 reuse this file.
