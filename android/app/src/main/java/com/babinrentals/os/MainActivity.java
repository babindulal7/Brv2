package com.babinrentals.os;

import android.os.Bundle;
import androidx.appcompat.app.AppCompatActivity;

/**
 * Main Activity for Babin Rentals OS Android Native Shell.
 *
 * Security & Keystore configuration:
 * Android Keystore MasterKey provides hardware-backed AES-256-GCM
 * key wrapping for EncryptedSharedPreferences (PLAN.md §10).
 */
public class MainActivity extends AppCompatActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
    }
}
