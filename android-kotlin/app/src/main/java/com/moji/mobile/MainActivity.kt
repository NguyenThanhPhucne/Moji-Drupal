package com.moji.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Surface
import com.moji.mobile.ui.navigation.AppNavGraph
import com.moji.mobile.ui.theme.MojiMobileTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MojiMobileTheme {
                Surface {
                    AppNavGraph()
                }
            }
        }
    }
}
