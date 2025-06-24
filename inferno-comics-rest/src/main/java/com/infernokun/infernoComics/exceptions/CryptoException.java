package com.infernokun.infernoComics.exceptions;

public class CryptoException extends RuntimeException {
  public CryptoException(String msg, Throwable cause) {
    super(msg, cause);
  }

  public CryptoException(String msg) {
    super(msg);
  }
}
