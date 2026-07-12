<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ChevronDown, ClipboardCopy, Delete, History, RotateCcw, Sigma } from 'lucide-vue-next';

const HISTORY_STORAGE_KEY = 'hermesAgentOsCalculatorHistory:v1';
const MEMORY_STORAGE_KEY = 'hermesAgentOsCalculatorMemory:v1';

function readHistory() {
  try {
    const saved = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved.slice(0, 12) : [];
  } catch (_) {
    return [];
  }
}

function readMemory() {
  const saved = Number(localStorage.getItem(MEMORY_STORAGE_KEY) || '0');
  return Number.isFinite(saved) ? saved : 0;
}

function factorial(value) {
  if (!Number.isInteger(value) || value < 0 || value > 170) throw new Error('Invalid factorial');
  let result = 1;
  for (let index = 2; index <= value; index += 1) result *= index;
  return result;
}

function formatNumber(value) {
  if (!Number.isFinite(value)) throw new Error('Invalid number');
  if (Math.abs(value) < 1e-12) return '0';
  const fixed = Number.parseFloat(value.toPrecision(12));
  return String(fixed);
}

function tokenize(source) {
  const expression = source
    .replaceAll('×', '*')
    .replaceAll('÷', '/')
    .replaceAll('π', 'pi');
  const tokens = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/\d|\./.test(char)) {
      let value = char;
      index += 1;
      while (index < expression.length && /[\d.]/.test(expression[index])) {
        value += expression[index];
        index += 1;
      }
      tokens.push({ type: 'number', value: Number(value) });
      continue;
    }
    if (/[a-z]/i.test(char)) {
      let value = char;
      index += 1;
      while (index < expression.length && /[a-z]/i.test(expression[index])) {
        value += expression[index];
        index += 1;
      }
      tokens.push({ type: ['pi', 'e'].includes(value) ? 'constant' : 'function', value });
      continue;
    }
    if ('+-*/^%!'.includes(char)) tokens.push({ type: 'operator', value: char });
    else if (char === '(') tokens.push({ type: 'leftParen', value: char });
    else if (char === ')') tokens.push({ type: 'rightParen', value: char });
    else throw new Error('Invalid token');
    index += 1;
  }
  return tokens;
}

const precedence = {
  '!': 6,
  '%': 6,
  'u-': 5,
  '^': 4,
  '*': 3,
  '/': 3,
  '+': 2,
  '-': 2
};

function toRpn(tokens) {
  const output = [];
  const stack = [];
  let previousType = 'start';

  tokens.forEach((token) => {
    if (token.type === 'number' || token.type === 'constant') {
      output.push(token);
      previousType = 'value';
      return;
    }
    if (token.type === 'function') {
      stack.push(token);
      previousType = 'function';
      return;
    }
    if (token.type === 'leftParen') {
      stack.push(token);
      previousType = 'leftParen';
      return;
    }
    if (token.type === 'rightParen') {
      while (stack.length && stack.at(-1).type !== 'leftParen') output.push(stack.pop());
      if (!stack.length) throw new Error('Mismatched parentheses');
      stack.pop();
      if (stack.at(-1)?.type === 'function') output.push(stack.pop());
      previousType = 'value';
      return;
    }
    if (token.type === 'operator') {
      const operator = token.value === '-' && ['start', 'operator', 'leftParen', 'function'].includes(previousType)
        ? 'u-'
        : token.value;
      const rightAssociative = ['^', 'u-'].includes(operator);
      while (stack.length && stack.at(-1).type === 'operator') {
        const top = stack.at(-1).value;
        if (
          (!rightAssociative && precedence[operator] <= precedence[top])
          || (rightAssociative && precedence[operator] < precedence[top])
        ) output.push(stack.pop());
        else break;
      }
      stack.push({ type: 'operator', value: operator });
      previousType = operator === '!' || operator === '%' ? 'value' : 'operator';
    }
  });

  while (stack.length) {
    const token = stack.pop();
    if (token.type === 'leftParen') throw new Error('Mismatched parentheses');
    output.push(token);
  }
  return output;
}

function evaluateRpn(tokens, angleMode) {
  const stack = [];
  const angle = (value) => (angleMode === 'deg' ? value * Math.PI / 180 : value);

  tokens.forEach((token) => {
    if (token.type === 'number') stack.push(token.value);
    else if (token.type === 'constant') stack.push(token.value === 'pi' ? Math.PI : Math.E);
    else if (token.type === 'function') {
      const value = stack.pop();
      if (value === undefined) throw new Error('Missing value');
      const functions = {
        sqrt: Math.sqrt,
        sin: (input) => Math.sin(angle(input)),
        cos: (input) => Math.cos(angle(input)),
        tan: (input) => Math.tan(angle(input)),
        log: Math.log10,
        ln: Math.log
      };
      const fn = functions[token.value];
      if (!fn) throw new Error('Unknown function');
      stack.push(fn(value));
    } else if (token.type === 'operator') {
      if (token.value === 'u-') {
        const value = stack.pop();
        stack.push(-value);
        return;
      }
      if (token.value === '%') {
        const value = stack.pop();
        stack.push(value / 100);
        return;
      }
      if (token.value === '!') {
        const value = stack.pop();
        stack.push(factorial(value));
        return;
      }
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) throw new Error('Missing operand');
      const operations = {
        '+': left + right,
        '-': left - right,
        '*': left * right,
        '/': left / right,
        '^': left ** right
      };
      stack.push(operations[token.value]);
    }
  });

  if (stack.length !== 1) throw new Error('Invalid expression');
  return stack[0];
}

function evaluateExpression(source, angleMode) {
  return evaluateRpn(toRpn(tokenize(source)), angleMode);
}

const calculatorRef = ref(null);
const expression = ref('');
const result = ref('0');
const error = ref('');
const angleMode = ref('deg');
const memory = ref(readMemory());
const historyItems = ref(readHistory());
const justEvaluated = ref(false);
const scientificOpen = ref(false);

const previewResult = computed(() => {
  if (!expression.value) return result.value;
  try {
    return formatNumber(evaluateExpression(expression.value, angleMode.value));
  } catch (_) {
    return result.value;
  }
});
const memoryLabel = computed(() => (memory.value ? formatNumber(memory.value) : '0'));

watch(historyItems, () => {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems.value.slice(0, 12)));
}, { deep: true });

watch(memory, () => {
  localStorage.setItem(MEMORY_STORAGE_KEY, String(memory.value));
});

function appendValue(value) {
  error.value = '';
  if (justEvaluated.value && /[\d.(]|pi|e|sqrt|sin|cos|tan|log|ln/.test(value)) expression.value = '';
  justEvaluated.value = false;
  expression.value += value;
}

function appendOperator(operator) {
  error.value = '';
  justEvaluated.value = false;
  expression.value = expression.value || result.value;
  expression.value += operator;
}

function clearAll() {
  expression.value = '';
  result.value = '0';
  error.value = '';
  justEvaluated.value = false;
}

function backspace() {
  error.value = '';
  if (justEvaluated.value) {
    clearAll();
    return;
  }
  expression.value = expression.value.slice(0, -1);
}

function toggleSign() {
  if (!expression.value) expression.value = result.value;
  expression.value = expression.value.startsWith('-(') && expression.value.endsWith(')')
    ? expression.value.slice(2, -1)
    : `-(${expression.value})`;
}

function runUnary(transform) {
  expression.value = transform(expression.value || result.value);
  justEvaluated.value = false;
}

function calculate() {
  try {
    const source = expression.value || result.value;
    const value = evaluateExpression(source, angleMode.value);
    const formatted = formatNumber(value);
    result.value = formatted;
    expression.value = formatted;
    historyItems.value.unshift({ expression: source, result: formatted, at: Date.now() });
    historyItems.value = historyItems.value.slice(0, 12);
    error.value = '';
    justEvaluated.value = true;
  } catch (_) {
    error.value = '无法计算';
  }
}

function memoryStore() {
  memory.value = Number(previewResult.value) || 0;
}

function memoryRecall() {
  appendValue(formatNumber(memory.value));
}

function memoryAdd(direction = 1) {
  memory.value += (Number(previewResult.value) || 0) * direction;
}

function clearMemory() {
  memory.value = 0;
}

async function copyResult() {
  await navigator.clipboard?.writeText(previewResult.value);
}

function loadHistory(item) {
  expression.value = item.result;
  result.value = item.result;
  error.value = '';
  justEvaluated.value = true;
}

function handleKeydown(event) {
  const key = event.key;
  if (/^\d$/.test(key)) appendValue(key);
  else if (key === '.') appendValue('.');
  else if (key === '+') appendOperator('+');
  else if (key === '-') appendOperator('-');
  else if (key === '*') appendOperator('*');
  else if (key === '/') appendOperator('/');
  else if (key === '(' || key === ')') appendValue(key);
  else if (key === 'Enter' || key === '=') calculate();
  else if (key === 'Backspace') backspace();
  else if (key === 'Escape') clearAll();
  else return;
  event.preventDefault();
}

onMounted(() => {
  calculatorRef.value?.focus();
});

onBeforeUnmount(() => {
  localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems.value.slice(0, 12)));
  localStorage.setItem(MEMORY_STORAGE_KEY, String(memory.value));
});

defineExpose({
  evaluate: (source = '') => {
    const input = String(source || result.value || '0');
    expression.value = input;
    calculate();
    return {
      expression: input,
      result: previewResult.value,
      error: error.value
    };
  },
  clear: () => {
    clearAll();
    return { result: result.value };
  },
  state: () => ({
    expression: expression.value,
    result: previewResult.value,
    angleMode: angleMode.value,
    memory: memory.value,
    history: historyItems.value
  })
});
</script>

<template>
  <section ref="calculatorRef" class="calculator-panel" tabindex="0" @keydown="handleKeydown">
    <main class="calculator-main">
      <header class="calculator-display">
        <div class="calculator-display-top">
          <span>{{ angleMode.toUpperCase() }}</span>
          <span>M {{ memoryLabel }}</span>
        </div>
        <small>{{ expression || '0' }}</small>
        <strong>{{ error || previewResult }}</strong>
      </header>

      <section class="calculator-memory-row" aria-label="内存">
        <button type="button" @click="clearMemory">MC</button>
        <button type="button" @click="memoryRecall">MR</button>
        <button type="button" @click="memoryAdd(1)">M+</button>
        <button type="button" @click="memoryAdd(-1)">M-</button>
        <button type="button" @click="memoryStore">MS</button>
        <button type="button" title="复制结果" @click="copyResult"><ClipboardCopy :size="15" /></button>
      </section>

      <button type="button" class="calculator-science-toggle" :class="{ open: scientificOpen }" @click="scientificOpen = !scientificOpen">
        <ChevronDown :size="15" />
        科学计算
      </button>

      <section class="calculator-grid" :class="{ basic: !scientificOpen, scientific: scientificOpen }" aria-label="计算器按键">
        <template v-if="scientificOpen">
          <button type="button" class="calc-key function" @click="angleMode = angleMode === 'deg' ? 'rad' : 'deg'">{{ angleMode.toUpperCase() }}</button>
          <button type="button" class="calc-key function" @click="appendValue('sin(')">sin</button>
          <button type="button" class="calc-key function" @click="appendValue('cos(')">cos</button>
          <button type="button" class="calc-key function" @click="appendValue('tan(')">tan</button>
          <button type="button" class="calc-key function" @click="appendValue('log(')">log</button>

          <button type="button" class="calc-key function" @click="appendValue('ln(')">ln</button>
          <button type="button" class="calc-key function" @click="runUnary((value) => `sqrt(${value})`)">√</button>
          <button type="button" class="calc-key function" @click="runUnary((value) => `(${value})^2`)">x²</button>
          <button type="button" class="calc-key function" @click="appendOperator('^')">xʸ</button>
          <button type="button" class="calc-key function" @click="appendValue('!')">x!</button>

          <button type="button" class="calc-key utility" @click="clearAll"><RotateCcw :size="15" /> AC</button>
          <button type="button" class="calc-key utility" @click="backspace"><Delete :size="15" /></button>
          <button type="button" class="calc-key utility" @click="appendValue('%')">%</button>
          <button type="button" class="calc-key utility" @click="appendValue('(')">(</button>
          <button type="button" class="calc-key utility" @click="appendValue(')')">)</button>

          <button type="button" class="calc-key" @click="appendValue('7')">7</button>
          <button type="button" class="calc-key" @click="appendValue('8')">8</button>
          <button type="button" class="calc-key" @click="appendValue('9')">9</button>
          <button type="button" class="calc-key operator" @click="appendOperator('/')">÷</button>
          <button type="button" class="calc-key constant" @click="appendValue('pi')">π</button>

          <button type="button" class="calc-key" @click="appendValue('4')">4</button>
          <button type="button" class="calc-key" @click="appendValue('5')">5</button>
          <button type="button" class="calc-key" @click="appendValue('6')">6</button>
          <button type="button" class="calc-key operator" @click="appendOperator('*')">×</button>
          <button type="button" class="calc-key constant" @click="appendValue('e')">e</button>

          <button type="button" class="calc-key" @click="appendValue('1')">1</button>
          <button type="button" class="calc-key" @click="appendValue('2')">2</button>
          <button type="button" class="calc-key" @click="appendValue('3')">3</button>
          <button type="button" class="calc-key operator" @click="appendOperator('-')">−</button>
          <button type="button" class="calc-key function" @click="runUnary((value) => `1/(${value})`)">1/x</button>

          <button type="button" class="calc-key" @click="toggleSign">±</button>
          <button type="button" class="calc-key" @click="appendValue('0')">0</button>
          <button type="button" class="calc-key" @click="appendValue('.')">.</button>
          <button type="button" class="calc-key operator" @click="appendOperator('+')">+</button>
          <button type="button" class="calc-key equals" @click="calculate">=</button>
        </template>

        <template v-else>
          <button type="button" class="calc-key utility" @click="clearAll"><RotateCcw :size="15" /> AC</button>
          <button type="button" class="calc-key utility" @click="backspace"><Delete :size="15" /></button>
          <button type="button" class="calc-key utility" @click="appendValue('%')">%</button>
          <button type="button" class="calc-key operator" @click="appendOperator('/')">÷</button>

          <button type="button" class="calc-key" @click="appendValue('7')">7</button>
          <button type="button" class="calc-key" @click="appendValue('8')">8</button>
          <button type="button" class="calc-key" @click="appendValue('9')">9</button>
          <button type="button" class="calc-key operator" @click="appendOperator('*')">×</button>

          <button type="button" class="calc-key" @click="appendValue('4')">4</button>
          <button type="button" class="calc-key" @click="appendValue('5')">5</button>
          <button type="button" class="calc-key" @click="appendValue('6')">6</button>
          <button type="button" class="calc-key operator" @click="appendOperator('-')">−</button>

          <button type="button" class="calc-key" @click="appendValue('1')">1</button>
          <button type="button" class="calc-key" @click="appendValue('2')">2</button>
          <button type="button" class="calc-key" @click="appendValue('3')">3</button>
          <button type="button" class="calc-key operator" @click="appendOperator('+')">+</button>

          <button type="button" class="calc-key" @click="toggleSign">±</button>
          <button type="button" class="calc-key" @click="appendValue('0')">0</button>
          <button type="button" class="calc-key" @click="appendValue('.')">.</button>
          <button type="button" class="calc-key equals" @click="calculate">=</button>
        </template>
      </section>
    </main>

    <aside class="calculator-history">
      <header>
        <span><History :size="15" /> 历史</span>
        <button type="button" title="清空历史" @click="historyItems = []">清空</button>
      </header>
      <div class="calculator-history-list">
        <button v-for="item in historyItems" :key="`${item.at}-${item.result}`" type="button" @click="loadHistory(item)">
          <small>{{ item.expression }}</small>
          <strong>{{ item.result }}</strong>
        </button>
        <p v-if="!historyItems.length"><Sigma :size="17" /> 暂无历史</p>
      </div>
    </aside>
  </section>
</template>
