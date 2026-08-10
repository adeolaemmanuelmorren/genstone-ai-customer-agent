while (<STDIN>) {
  s/\e\[[0-9;]*[A-Za-z]//g;
  print;
}
