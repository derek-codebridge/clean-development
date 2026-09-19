pub fn add(left: i64, right: i64) -> i64 {
    left + right
}

#[cfg(test)]
mod tests {
    use super::add;

    #[test]
    fn adds_positive_zero_and_negative_values() {
        assert_eq!(add(5, 7), 12);
        assert_eq!(add(0, 0), 0);
        assert_eq!(add(-5, 7), 2);
    }
}
