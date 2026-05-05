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
