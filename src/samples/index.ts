// CCompilePanel のサンプル選択に使うCコードテンプレート定義。
// コンパイルは都度 Godbolt API に投げるため、アセンブラはここには持たない。

export interface SampleDef {
  id: string
  name: string
  cCode: string
}

export const SAMPLES: SampleDef[] = [
  {
    id: 'funcCall',
    name: '関数呼び出し',
    cCode: `int add(int a, int b) {
  return a + b;
}

int main() {
  return add(3, 5);
}`,
  },
  {
    id: 'branch',
    name: '条件分岐',
    cCode: `int compare(int a, int b) {
  if (a < b) return -1;
  else if (a == b) return 0;
  else return 1;
}

int main() {
  int r1 = compare(3, 3);
  int r2 = compare(5, 3);
  int r3 = compare(3, 5);
  return r1 + r2 + r3;
}`,
  },
  {
    id: 'loop',
    name: 'ループ',
    cCode: `int sum_to(int n) {
  int sum = 0;
  for (int i = 1; i <= n; i++) {
    sum += i;
  }
  return sum;
}

int main() {
  return sum_to(5);
}`,
  },
  {
    id: 'stackFrame',
    name: 'スタックフレーム',
    cCode: `int funcB(int p) {
  int q = p * 2;
  return q;
}

int funcA(int a, int b) {
  int result = funcB(a + b);
  return result;
}

int main() {
  int x = 10;
  int y = 20;
  int z = funcA(x, y);
  return z;
}`,
  },
  {
    id: 'pointerPass',
    name: 'ポインタ渡し',
    cCode: `void double_it(int *p) {
  *p = *p * 2;
}

int main() {
  int x = 5;
  double_it(&x);
  return x;
}`,
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
  },
]
