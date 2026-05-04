export interface SampleDef {
  id: string
  name: string
  cCode: string
  compilerId: string
  optLevel: string
  extraFlags: string
}

export const ARM_SAMPLES: SampleDef[] = [
  {
    id: 'funcCall',
    name: '関数呼び出し',
    cCode: `int add(int a, int b) {
    return a + b;
}

int main() {
    return add(3, 5);
}`,
    compilerId: 'carm1121',
    optLevel: '-O0',
    extraFlags: '-mcpu=cortex-m3 -mthumb',
  },
  {
    id: 'arithmetic',
    name: '四則演算',
    cCode: `int main() {
    int a = 10, b = 3;
    int sum  = a + b;
    int diff = a - b;
    int prod = a * b;
    int quot = a / b;
    return sum + diff;
}`,
    compilerId: 'carm1121',
    optLevel: '-O0',
    extraFlags: '-mcpu=cortex-m3 -mthumb',
  },
  {
    id: 'branch',
    name: '条件分岐',
    cCode: `int compare(int a, int b) {
    if (a < b) return 1;
    if (a == b) return 0;
    return -1;
}

int main() {
    return compare(5, 10);
}`,
    compilerId: 'carm1121',
    optLevel: '-O0',
    extraFlags: '-mcpu=cortex-m3 -mthumb',
  },
  {
    id: 'pointer',
    name: 'ポインタとアドレス',
    cCode: `int main() {
    int x = 42;
    int *ptr;
    ptr = &x;
    *ptr = 100;
    int y = *ptr;
    return y;
}`,
    compilerId: 'carm1121',
    optLevel: '-O0',
    extraFlags: '-mcpu=cortex-m3 -mthumb',
  },
  {
    id: 'array',
    name: '配列を関数に渡す',
    cCode: `int sum_array(int *a, int n) {
    int s = 0;
    s += a[0];
    s += a[1];
    s += a[2];
    return s;
}

int main() {
    int arr[3] = {1, 2, 3};
    return sum_array(arr, 3);
}`,
    compilerId: 'carm1121',
    optLevel: '-O0',
    extraFlags: '-mcpu=cortex-m3 -mthumb',
  },
]

export const X86_SAMPLES: SampleDef[] = [
  {
    id: 'x86_funcCall',
    name: '関数呼び出し',
    cCode: `int add(int a, int b) {
    return a + b;
}

int main() {
    return add(3, 5);
}`,
    compilerId: 'x86-64g1420',
    optLevel: '-O0',
    extraFlags: '-masm=intel',
  },
  {
    id: 'x86_arithmetic',
    name: '四則演算',
    cCode: `int main() {
    int a = 10, b = 3;
    int sum  = a + b;
    int diff = a - b;
    int prod = a * b;
    int quot = a / b;
    return sum + diff;
}`,
    compilerId: 'x86-64g1420',
    optLevel: '-O0',
    extraFlags: '-masm=intel',
  },
  {
    id: 'x86_branch',
    name: '条件分岐',
    cCode: `int compare(int a, int b) {
    if (a < b) return 1;
    if (a == b) return 0;
    return -1;
}

int main() {
    return compare(5, 10);
}`,
    compilerId: 'x86-64g1420',
    optLevel: '-O0',
    extraFlags: '-masm=intel',
  },
  {
    id: 'x86_pointer',
    name: 'ポインタとアドレス',
    cCode: `int main() {
    int x = 42;
    int *ptr;
    ptr = &x;
    *ptr = 100;
    int y = *ptr;
    return y;
}`,
    compilerId: 'x86-64g1420',
    optLevel: '-O0',
    extraFlags: '-masm=intel',
  },
  {
    id: 'x86_array',
    name: '配列を関数に渡す',
    cCode: `int sum_array(int *a, int n) {
    int s = 0;
    s += a[0];
    s += a[1];
    s += a[2];
    return s;
}

int main() {
    int arr[3] = {1, 2, 3};
    return sum_array(arr, 3);
}`,
    compilerId: 'x86-64g1420',
    optLevel: '-O0',
    extraFlags: '-masm=intel',
  },
]
