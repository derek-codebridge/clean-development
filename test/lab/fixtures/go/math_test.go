package lab

import "testing"

func TestAdd(t *testing.T) {
	for _, item := range []struct{ left, right, want int }{
		{5, 7, 12},
		{0, 0, 0},
		{-5, 7, 2},
	} {
		if got := Add(item.left, item.right); got != item.want {
			t.Errorf("Add(%d, %d) = %d; want %d", item.left, item.right, got, item.want)
		}
	}
}
