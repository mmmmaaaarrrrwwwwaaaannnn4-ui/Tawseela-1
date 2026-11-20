import { useCallback, useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Alert, Animated, Image, Linking, ScrollView, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { Sheet } from '@/components/ui/overlays';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Txt } from '@/components/ui/txt';
import { useStatusBar } from '@/hooks/use-status-bar';
import { isOutsideServiceArea } from '@/lib/service-area';
import { useApp } from '@/store/app-store';
import { useTheme } from '@/theme/theme';

// أيقونات PNG (96x96، أسود على خلفية شفافة) بصيغة base64.
// بتتلوّن عن طريق tintColor فبتشتغل مع الـ dark mode.
const ICONS = {
  pin: 'data:image/png;base64,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',
  pinSolid: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFQ0lEQVR42u2dTYgcVRDHfz292QjLXhYNbBLxIyzEi5jEg3uPeAjqzYNeFE+KsAdBvARyT8hBRBBEcjHkEJZcIpJTrpKRoOQgEhJjEElyyCmJrtPdHqaKefvs7p2ZnX7TH/WHx7A9Pe9V1/9VvXrV1b1gMBgMBoPBYDAYDM1CJK3RF9AUOXuOvCmQSXOJ6MnfmXOOYReIpc3r9521gNibwXuBl4FX5fMF4BlgSb5/BDwAbgO/AH35/MezoMTmdDl6jhsBWAe+AG46LmfcdlN+u17Sv8Gb9YrXgSueQlPgX2kDmc1uGzjfp95vr0ifeWMZHIWsAZs5Sk+msIAkh4xNGcNI8HwzwHvAQ0d5gymUXtQGDokPZSy8yKrTyj/tKSurqLl9n+4yCZG4gAg4LwrJ891VNHVrmYztytIZLMjnOVHEVgDF+03HPOfJ1Bnln5xA+WnFJJzsCgkaeRwfw+0kjqtQ/z2o0B0db3t0pIvuMnBXLj4ZY7H0LSCdsUUk0t9dka21i7LOrDPO7C9T/s/AR8BR4CXgLeBCRW5JZTnTVivQWXVQ8jZJgQLVIr4CFgv6eht4XNLHtK4oEdkOeiFyqxbesyWzf+CkDdRlLTj5mxjYI9+97xE2Sys427YFWf3psmQsi3y/5nSOOsrP60uP/zTjjZta1AORlRBrQQgzU396AnhaLtIfV4/9BlyXY3mpY/cGzKZ3bBa6SEXGE6HWghAEqILeZPtdrLxz/nAUnO3Q552KZM1E1lmSOzcCIpnJexjm5YsWNzX1lRKS/PNXKgwW1kXmpOkhqSp7zfHVaUEUkgJPgGcpv3Gia8D3FSTvUqfPtRCTNIQFKAFxyYxSS3kK+FwUseDMSG2LopzXgDfkvLgCi40dAqI2ELA6hk9dEIV+DHwgeZo0J3fzPPBdhYrJPJkbTYBi/wSEpcC3wDfAK2IVPeAA8AnwI/BiAPn3h1BMqM1GbwICNAL6UNod4G/ZoS55YWvjJ2coAqIpzldf/JxzPCFcZUPUJgLuT7mB86vfQibJ7reJgL92YQmh4/DIk7nRfi6Vz1vOeHWu18wcndzyrqGR0Nm0BNyj2tuLs9yI3XMW/EaHoTqjHjGs18xqPqOUgL7IXLnFhogmdIwf2DnJVgcXFImsIfdJQQg4wPBOVlpTN6RyPRZZgxDQC2TWMfAncNmJ8esGzVNdFlnjpi/AfkwPcIzyaoh5Nr0jdsyTmbaRcInqa0CnrRm91Fblq7uLgEMM8/6DmqwFqcjyRGRrXUVEnhVsML+a0KLyxI02z/689MfFGpCgY18MnJqZ++64JzvNPvOvju6LLJ16TkB97CpwYw4k6Fg3GN356tzDe3rB+4CrjKrTqgxR3YrrqzJ2J5Xvk7AIfMn2MsFZRkhuGXomYy12Xfl5u/F3GD5snc3IIvxnDG7LGJjy/78wa/i3ApxilL6elAx/tmt6+RSjYq7OPRM26T5B14ZPgWu7sIBr0se+gjEMBdbgx+NHZKPUp7y6OgV+lXOP5Ow/bNbvkojPKH6+QI993STF13nnp0kyjZJSRrcJy7CXUVnjltNH7SOQOiN1knfjEteIXL6FYUaAEWAwAowAgxFgBBiMACPAYAQYAQYjwAgwGAFGgMEIMAIMRoARYDACjACDEQC06KnFphKwPMY5mRFQHVbZ+XWWsRFQHX6nvMwwYvTuUUMFE+Uw2/+XgL5ewP3fAoctwKiWBH3ENa9tmPKrhfr3dxm+Y3pL2nU5Blb/H3TdOiTN9jVzsoSdjtUeTX5ixH2h3zgv/DYYDAaDwWAw1Ab/AWCBMTBJQmTJAAAAAElFTkSuQmCC',
  nav: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAFMElEQVR42u2dX6gVRRzHP+fco5mUpSEkZRCEFfogRi9CQSAEERgR9RTSQz0EUWAQEdKDKIEvYiGUZvTnIYooqSAo6vYQRAVBZFBBUURSohRicbv37PawM5xx2HvcObuzOzP7+8Jwj3u9F3d+v9/3+53f7I4gEAgEAoFAIBAIBIJZMaeGoEUM1KQPrGsCzxgCI+vabcBd6vNIpshftg+Na2uAXcAnQA6cMmhIKqHBibcz+kZgP/CrmvgcGKsxD+xQPzeU6atHM6aojoA7gHeABWPil9TIja/3GsIsqCmqG4DdwDfGpOfAIpBZFZADJ9TPD4SG6onqduAIcNqa5CVr4s2A5MCjIsT1RXW+ZHLHJZOuhw7IX8B6EeFmRDWbku3LZf8Lkv3NimrVMVaBuknEtzlRrTp0lcwbgZZsb0BUXQKQA/f1nX6aFFUX6smBX4CL+2o9fYhq1aHF9+k+Zr9PUa0yMjX+Aa7pC/+3Iaqu2f9mH5xPm6Lqyv+3GokhotrS0JT2dYrC26WougbgoZTEt2tRdRFfvfmyJva+T0ii6iq+B2PO/hBF1cV6LgI3xGY9QxZV177PBzFNfgyi6iq+dy5zXyKqLfj+H4GVodrPGEXVVXwfD1F8YxVVV+t5FrgyFP5PQVRds//FEPo+KYmqK//f3HXfJyVRdbWen4VCPamIqqv1vL8r8dV26yLgEHAmAVF1pZ7fgNVdWU8d8T0Jiaqr+O7zlf0uv/B6Js+/rCB95ErzFoCj6lrmw79XxX8li6yUMVb3+j7ws7r3TgPQN+i5Oewz6VwCsMLg/dSRqbk5QfH2ixf6cQ3ASWPlu+TrHxQQ/+vsz9R9d5Z42npdTvEIxmLiNlTfyxlgrTEHwWAzsBf4PrF+j209nwuh72NXgklZq4CdwFvAuUSqQm85jlWiBWlUylrP1wJPUDwnYy/jY6oKnTgfxeASdVdwzgrODuCYtQ+QRdIr0n2fnV31fZqsig3AI6qLmJd0S0MLhq7Unwh4y3GWqoBid+wQ8HvAwq3F98nYsn9aMEZWFq0DHgA+tCa+66rQ4nsOuCrFLsGwpCq2As+oku+6KnT2vxKa9fRFUWZ2rQbupthZ+7dkQdQm/28n0UfNqwr3JuAp1YNpKwia+j7va4OyrCpGwJdMNvbbsJ67UhHfulWxSn1+0OJnn9RzErgkxL5Pl82/K4C/PVORDu4Byf7zoUXwJWMV7ct6LgDX9ZX/LxSAWyyq8JH976ZuPevQ0Bzwracg6N93e5+spws0H+/2IMbm6VZD5HSrZR0RwEaKt9GzBsVYTrdy1IK3GxRjc8txXdfWM3TV19RwrEGaGKuvb6ggdLrhHosYr6R4OKoJMdZUtlXE102M9zcgxrrv86n4fnea3MRkWzOjXt/nHhHf2YLwcY0GXZCnWw0jCsCA4qW/WSdNP8l3lGLfQcTXUYwBLgX+xL1BZ55udXVIyRdLBeSKr88Cr1t2sqr1HADHKd528fKoeV8WZdtmqADzdCvEetav2C8sV1PF+XxFgGf6DyMNwMsGNVWhL4Dn1Wfx/g2I8XqKk8ovREX6e38AlxFg1zO2bNAvzp0C3qsgxvp7r1Fsb4r1bEiMBxT/a9G03lDUp1uFTkNaTL+bEgQtvkGfbhVjRuSGj3/VWuWW4Vlkx8tb4mxUbYVFJi+DjI0//8DkAWEJgKeF2fEpLugx9XeC7XrG3I7NVVY/TPEW/xbjuj7Z8LCqlrHka3trBEEHEz83xa5K1nRwL7LYEggEAoFAIBAIlsf/yPnnLsxSC80AAAAASUVORK5CYII=',
  chevron: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAADKklEQVR42u2dvWtTURjGnyapQ1xF0sGp2KGLs4tkV+wkdHNzdAj4N3QqxU03tyAuBQfHDoIuCl0qdqogWBwEhwalTXJdzoFDSdJ7Pu49t/b3wKUlTSj8nnPe856vNxJCCCGEEEIIIYQQqlBLIMijtnmsOpJaYKlHrQU9oA2easONhb8h6Y2kL5I+S9qRdHuGQSghfNu6X0oqZjy/JT3EhGrgd8zv2wb2mXkm5jk1r48krZ7rLShSy+bnloF8OqcH2NefOwMzipSFOHBa/nSOARPzt32n55CmJoQ/XgDfGlBIOmSekC7slGn5xbn37JKSpoH/1AO+OwY8wIB4+Jslw47b+guTopKGJoI/8Wz5207LJ/bXDP8F8OPhPwqEP3RmysAPTDX7kv46M9uyMX/oxHzgR8AfmVY/8Wz5wE8Ev/CEvwv8ePj3POHbsLMnqWvgk24Gwl+X9MvJ9X3hk+tHwj8Gfr1qR8L/APx88A8k3WR9Jw5+T9JRIPwe8OPhH3jAHwM/P/xD4MfDX3Hgn3nAP5a0Bvww2QylK+lTIPx14MfD34uEz4mGmuH/BH4c/Jak657w7frPSNJd4IfJPYH2TosPTs2D3wd+OHy7CzUEfr5085Un/Anw08F/7AHf3fHaMJ9fBmVY6LHh56vK7eO6m+ybwE+Tcq46aeS0RMs/cVp+538GU2cY8vmfYzPZQolC0DVJ3zxD0B8G37SD8ID0M+8EbCliAsbsN5EJvksQrP9UMPB3Jb0XK6BZx4MbCt+AYQ8gkQk9TGiWCWNPE25hQl4TOAmR2IQjTMhrQsxpOExogAkrmBCn2BPR++JQblITfohj6VlNuKO4WzGYkMCEPiZcfhO4H5bBBG5IVmTCicpf0OaOcELZUxH35VeigFvyFZgQWqRj6EzUMCEyHGHCJe4JO5iQ3oSxKNiUzYTQenGULEtowkAU7cs+MA88whFlKys24aKeQOHWCsPRM1180oLSxRVoVuV0inc3wATK12cwofFf4HAVRv2WpLcmzneMMd8lvZb0RNJH854pbbZaE+ZlOaSeNfZ2vsaqIWMDQgghhBBCCCGE0FXUP+quYgxerN3KAAAAAElFTkSuQmCC',
  close: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAACvklEQVR42u2cMW7bQBBFPykFMYSULnKFwI3sEyR1Gt0mV/FFDCOVlAskaXwBI0cIVCQMmcKz8IKwQZsUNUPxPWBBQaCImf+Xu0uKHAkAAAAAAAAAAAAAAE6dYqTjltYkqZFU23Zq2pSZRrW18JSv/H7WOYx1BlxJ+iTpnaSfkm4kVZZAPQHxa0lLSZ8lrSX9lrSV9D366bqQdG3DTd5+SLqwfReBxU+xXVjM7TyubZ9yxM47KPAkfiXpb9YaSb8knQc2IcV0brE2rRyqzIRQOaRxcZ0FXbd6zh/bfpO0CjgnpFhWFmMec5MtJFJnWkfKYWnbL60g2y19vw1mQi7+thXrUznUlmue+8Fn+z6sOpaaSzuNP9qkvLJkSmfxa4vlxmKrOoRtsg4UauzcdPSeaGfCa3p+O/ZNpHkgrYDeSrp7ZvyMZkIf8VNOd5ZrqJVQSuiDpPvgZ8KQnn9vOYa8sEwBve+R2LFMGCL+1nILfVW/GJjgmCaUB4ot8oVkWBNmI/6hEy5PLJbZmTBb8SMIMHvxPYVAfEdBEN9RGMR3NAHxHU1AfEcTEN/RhMIa4juZ8MYa4juZ8NUa4juY8O+Zz4h/RBMqPT4ugvhOJiB+UBMQ/0Am7F44zj81P+wQf5gJhaQzSbd6eH6neoH4le17a78tIotPrwCGICZhYBnKhRjicytiSuJzMy6A+NyOdhafP2ScxU/H4S9JR/HHPCbii8dSJiM+JgQQHxMCCYIJAYTg3YAAAvB2jHhF6ejwkh7iz9MEXtQOID6lChygWEeQcX8jytX0DmLoGSBJl+quiJiKIe30UJFwL79KiqlY1N5i2emxqFTX7y5bubsakNh3BBRJ/CEmFLZ/uAl4LYr2uc8DlK10XglRuLXnBHpoKF0cYDwdc8I/mRwoX989rE6ufD0AAAAAAAAAAAAAAMTiP+kG95tBnyH7AAAAAElFTkSuQmCC',
  alert: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAYAAADimHc4AAAIUUlEQVR42u2dXagVVRTHfzPn3NIo+5IbmJRWKFGQlS8SmUVQ+RBoREQvEvQo+WxFj1EPGRQFEX0Y1FsYpWAPBUKJoJUFhhB9QAmVmppYeu85p4ezFnex2fN1z8ycmXP3guHOnZmz91r/tfZaa+/Zew8EChQoUKBAgQIFChRooVHUEh7tkYcGzhEUUJBiOQZAb8SyOiJnX46ggAzQZz33lgPXAyvk/DLgWueZ34F/gN+AX4Bf5dylbpOU0QQFdMTSLSA3A+vluA1YCVxSsNxzwM/AYWCfHD84Co9KaGGtpY7z/2pgO3BAWoHrx/tyfSbjmJVn3d/PStnbpa40XiaaYqflbQQ+Bs47gCmgvQRAs46+/FbLsffOS50bHW8QT3rGZS3tEWC/B/T5Al5EIfb6fuHFDdoTZ/VKa4G9BoBeituo6lB31jPX9gpvPp5bTV35uxh40VigC0Be4PpGafbomftFyuyZmDMjPC52eG89+LcB3zjWV8RSZwoqq5cRkAcJQVqf/UZ4rlwJUYXlxgLEk8CrkkbO5hDIpqRudjILnABOAX+YPkMXuAa4ArjaU0cvIQHwkfJ4DtgKvC189Jveq/ZlEy84FpbH2u21k8Ae4FngQeAm6YRFCfVeJs88KL/ZI2UkWXpaa9DzFwoor1Hg7zR+tYjA/wK7gEeB6Rw95zgjYE5LWbuk7CIGofFqZxuUEJkU7kNh/EIOX63np4GXgVUeoLtSduwMyvnOY3m261HMKqnjdAIPvkNl+NCRsXHgq999Pyf4M8bSXpNxHgt6mqCx4+e7Ka0gMspTWiF19h1espTwvqmvUUroOj7/Qk5ffwBYlxPIPPl5nt9axa0THvLEhgtOTOg2DfwtOcC3zf1lYKoA8Bbg1cDrMtB2WM5XF+hAWUVMCS95XJLKtqUpSlBhb5UAl2ZFKtg54ImE4Yk8dd0DnPGUf0buFenFWjf3hPCWpgRtvf+KzGPtMSt4FwPfZ2QWKtBfwAZjeVGBuiJgqUkrL0i5PWOZJ+WZqGDZ2hI3CI9pSlAZvxfZxxaU1XJfyghkKsgJ4BYD/nzc3NMpbk6vbZune1CebhFe05Sgsr40ruHsjhlimE1xPdpk/2P4cmU+4Fswdzr5uQtKH3h3BP+svK0XnrPkmjVDFp1xKOCLDNejQD0+AvgWzFdTWptee2fEAKk8Pp7RslXmL+pWgFb0cAb4en3HiOBbMJ+rQQGW1x05ZXy4TiVoJ+lQysimXvva9GKjEhTwfE0KiExv+usUJaiLOuTp7BVK7YpYfx+4H7hDmOh4RjN1GshTZsSyFSOJDq+zIkNfZBp48BgIFvfLc50qFaC0leRJT30p902xjC7tnHnQE94PiSwx/qksisPWujpdN5qMo4//jdVZYBnlveiu2wXhjH4uE5nSZJ4RbAoZdjwPBTxmrDryWE0EvAUcS7GatpC25mMik28eUWRay2NVKkDB3WwqdptiRzpEryT4zDaSxrRXRLaORy7FYjMFJ3vFBZ4bMBxPv13O4wQFfcZwamDbrd9tBb+IbD6AFZ/bBaNBXmzjgoq6l7l3vVGCFbxXcCymDaTyvJfQ+lUpsWBE2QoYmC560v0OwzdNn1POrOamZUQDke10ghvCwWhQlgIiY/FrEn6nruZLGZGMJ8T/WwOLRbYvHZldLNc4mJWiACQVW5kSgAG+YnLnWGpK+lWChSsmKwUrylbADcAikxX4yjlIC1aljNAKBiKjDzvN+hYJVqUr4DrjD33Nswf82MJhh6LDEz+agDvwxAqLVSkKUFqecf84w9lqk66AP0TWUbCalwKWZDD2t3TXJ53OiqxphrakCgUsy1DAn06nZBJbQOzIOiiI1UgKyKIZFg6VJmtMoLHntmXRVA38NmVsaWocCjiWkaZOG5CqGgeaHiPokTGA6Yw081gVCjiToYArgUsrBuHyjAA/oPpBwEtF1jQFnKlCAb9l3F/KcJUKFYJwiOT3DAr+txW2AETGpSNiVYj0JfPdzL2CS5r99oDzmzKFr2pqYlEcHiB51pxic3deHPK0ALW2nxjOFvNZoPrGtRUJr9Z9HNjEcE+IKeZWx0zJtU3yTBVv41SutQkJgfL4n2BV2oiAXYFyJEH7Omdmd8XpbVnT00epezf+eUKKyREHs1Kb3wf4ZyVo0zsFXFVxHIhHbNGjGOFVIqPPFSsmHxRxw3FBBval3O9JlnIfxeb9z6cvkLREqap+gs7su09kTHvZsq8KA7RNP2lFulrAJxUFYlfhHfH9U1Q/R19l+STFA+gK/spcoQahgwk+UJk4z3ARXFVvxup2QfombIXI5jM+xeJg0SQkLmgFA+CjhAivbugihoskqugUqZuZAh4CnpHjIbnWr0AJmlFtE9l87kex+Aj/fNlSLW8cUxNt/euB7zw5+HfMzUiIS7b+yqYmztcXfkr21PQ3TIAsq967mNvYye6epXWel2fKikHK+xtkT1H/tIbYl7s3qD3UO0tgSn3qIuAo2WvEjsqzo3YIlec7jTzjGAXwNss6F2ioQBvJ3uNB720cEYzaFmiMAkhdS5Ts8qSkBXruQr3nRnR/jV6iZCuqY5Fe3Qpo/CI9W1kdy1TrdEGtWaZqK6x6oXZdQbhVC7VtoKpjq4Iq09DWblVgOxx1btZRZkes1Zt1uEFyC/VtV5M0FAELbLsaVwlhw6YxUd1bltmOUjfnsxO9ZZkVtM5N+3zZ0oLctM+CELatbJASwsatOcCqUglh6+KGZEdh8+4GKCFsXz9GCh9waFCaqhQ+YTLG1hA+4tMACp+xInzIbewfcgufMmxAYGxqnAgf82wQjxP7OdtAgQIFChQoUKBAgQItPPofeQR0NW2xwWwAAAAASUVORK5CYII=',
} as const;

type AddrIconName = keyof typeof ICONS;

function AddrIcon({
  name,
  size = 24,
  color,
  style,
}: {
  name: AddrIconName;
  size?: number;
  color: string;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={{ uri: ICONS[name] }}
      style={[{ width: size, height: size, tintColor: color }, style]}
      resizeMode="contain"
      fadeDuration={0}
    />
  );
}

const RED = '#E5392B';
const RED_BG = 'rgba(229, 57, 43, 0.09)';
const RED_BORDER = 'rgba(229, 57, 43, 0.35)';

type CurrentLocation = { address: string; latitude: number; longitude: number };

const closeScreen = () => (router.canDismiss() ? router.dismiss() : router.back());

const TAG_AR: Record<string, string> = { home: 'منزل', work: 'عمل', other: 'أخرى' };
const labelOf = (a: { tag: string }) => TAG_AR[(a.tag ?? '').toLowerCase()] ?? a.tag;

export default function AddressesScreen() {
  const { c } = useTheme();
  useStatusBar();
  const addrs = useApp((s) => s.addrs);
  const selected = useApp((s) => s.addr);
  const removeAddress = useApp((s) => s.removeAddress);

  const [current, setCurrent] = useState<CurrentLocation | null>(null);
  const [permission, setPermission] = useState<'checking' | 'granted' | 'denied'>('checking');
  const [noticeVisible, setNoticeVisible] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // الموقع الحالي: بيتجاب تلقائي أول ما الشاشة تفتح
  useEffect(() => {
    let active = true;

    const resolveAddress = async (latitude: number, longitude: number) => {
      try {
        const rows = await Location.reverseGeocodeAsync({ latitude, longitude });
        const place = rows[0];
        const address =
          [place?.name, place?.street, place?.district, place?.city]
            .filter(Boolean)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join('، ') || 'موقعك الحالي';
        if (active) setCurrent({ address, latitude, longitude });
      } catch {
        if (active) setCurrent({ address: 'موقعك الحالي', latitude, longitude });
      }
    };

    (async () => {
      try {
        const res = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (!res.granted) {
          setPermission('denied');
          return;
        }
        setPermission('granted');
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!active) return;
        await resolveAddress(p.coords.latitude, p.coords.longitude);
      } catch {
        if (active) setPermission('denied');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () => () => {
      clearTimeout(hideTimer.current);
      fade.stopAnimation();
    },
    [fade],
  );

  const outOfArea = !!current && isOutsideServiceArea(current.latitude, current.longitude);

  const showNotice = () => {
    clearTimeout(hideTimer.current);
    setNoticeVisible(true);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    hideTimer.current = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 220, useNativeDriver: true }).start(() =>
        setNoticeVisible(false),
      );
    }, 4500);
  };

  const openMap = () => router.push('/address-map' as never);

  const onCurrent = () => {
    if (permission === 'denied') {
      void Linking.openSettings();
      return;
    }
    if (!current) return; // لسه بيتحدد
    if (outOfArea) {
      showNotice();
      return;
    }
    router.push({ pathname: '/address-map', params: { current: '1' } } as never);
  };

  const selectAddress = useCallback((index: number) => {
    useApp.getState().setCheckout({ addr: index });
    closeScreen();
  }, []);

  const confirmDelete = useCallback(
    (index: number, title: string) => {
      Alert.alert('حذف العنوان', `هل تريد حذف عنوان "${title}"؟`, [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'حذف',
          style: 'destructive',
          onPress: () => removeAddress(index),
        },
      ]);
    },
    [removeAddress],
  );

  const currentSubtitle =
    permission === 'denied'
      ? 'اسمح بالوصول للموقع لعرض مكانك تلقائيًا'
      : current?.address || 'جارٍ تحديد موقعك تلقائيًا…';

  return (
    <Sheet
      visible
      onClose={closeScreen}
      title="العناوين المحفوظة"
      scroll={false}
      header={
        <View style={styles.header}>
          <PressableScale
            onPress={closeScreen}
            accessibilityRole="button"
            accessibilityLabel="إغلاق"
            style={[styles.closeBtn, { borderColor: c.line }]}
          >
            <AddrIcon name="close" size={22} color={c.text1} />
          </PressableScale>
          <Txt s={25} w={700} style={styles.title}>العناوين المحفوظة</Txt>
        </View>
      }
      footer={
        <View style={styles.footer}>
          <ActionCard
            icon="pinSolid"
            title="التوصيل إلى عنوان آخر"
            subtitle="اختر موقع على الخريطة"
            chevron
            onPress={openMap}
          />

          <ActionCard
            icon="nav"
            title="التوصيل إلى الموقع الحالي"
            subtitle={currentSubtitle}
            dimmed={outOfArea}
            onPress={onCurrent}
          />

          {noticeVisible ? (
            <Animated.View style={[styles.notice, { opacity: fade, backgroundColor: RED_BG, borderColor: RED_BORDER }]}>
              <AddrIcon name="alert" size={24} color={RED} />
              <View style={styles.textCol}>
                <Txt s={16} w={700} color={RED}>عذرًا، لا نغطي منطقتك بعد</Txt>
                <Txt s={14} color={RED}>نعمل على توفير الخدمة في منطقتك قريبًا. حاليًا نوصّل داخل مدينة بلبيس فقط.</Txt>
              </View>
            </Animated.View>
          ) : null}
        </View>
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <Txt s={22} w={700} style={styles.section}>عناوين التوصيل</Txt>

        {addrs.length === 0 ? (
          <Txt s={15} color={c.text3} style={styles.empty}>لا توجد عناوين محفوظة بعد</Txt>
        ) : (
          addrs.map((a, i) => (
            <SavedRow
              key={a.latitude != null && a.longitude != null ? a.latitude + ':' + a.longitude + ':' + a.l1 : a.l1 + ':' + i}
              title={labelOf(a)}
              address={a.l1 + (a.l2 ? '، ' + a.l2 : '')}
              selected={selected === i}
              onPress={() => selectAddress(i)}
              onDelete={() => confirmDelete(i, labelOf(a))}
            />
          ))
        )}
      </ScrollView>
    </Sheet>
  );
}

function SavedRow({
  title,
  address,
  selected,
  onPress,
  onDelete,
}: {
  title: string;
  address: string;
  selected: boolean;
  onPress: () => void;
  onDelete: () => void;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.savedRow}>
      <PressableScale onPress={onPress} style={styles.savedMain}>
        <AddrIcon name="pin" size={26} color={selected ? c.accent : c.text1} />
        <View style={styles.textCol}>
          <Txt s={17} w={600} color={selected ? c.accent : undefined}>{title}</Txt>
          <Txt s={15} color={c.text3} numberOfLines={2}>{address}</Txt>
        </View>
      </PressableScale>
      <PressableScale
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel={`حذف عنوان ${title}`}
        style={styles.deleteBtn}
      >
        <AddrIcon name="close" size={20} color={c.text3} />
      </PressableScale>
    </View>
  );
}

function ActionCard({
  icon,
  title,
  subtitle,
  chevron = false,
  dimmed = false,
  onPress,
}: {
  icon: 'pinSolid' | 'nav';
  title: string;
  subtitle: string;
  chevron?: boolean;
  dimmed?: boolean;
  onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      style={[styles.card, { borderColor: c.line, opacity: dimmed ? 0.45 : 1 }]}
    >
      <AddrIcon name={icon} size={26} color={c.text1} />
      <View style={styles.textCol}>
        <Txt s={17} w={700}>{title}</Txt>
        <Txt s={15} color={c.text3} numberOfLines={1}>{subtitle}</Txt>
      </View>
      {chevron ? <AddrIcon name="chevron" size={24} color={c.text3} /> : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 14 },
  closeBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, alignSelf: 'flex-end', alignItems: 'center', justifyContent: 'center' },
  title: { marginTop: 18, textAlign: 'right' },
  section: { marginTop: 12, marginBottom: 14, textAlign: 'right' },
  empty: { textAlign: 'right', paddingVertical: 10 },

  savedRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minHeight: 64, marginBottom: 4 },
  savedMain: { flex: 1, flexDirection: 'row-reverse', alignItems: 'center', gap: 14, paddingVertical: 8 },
  deleteBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  textCol: { flex: 1, alignItems: 'flex-end', gap: 3 },

  footer: { paddingBottom: 4, gap: 10 },
  card: { minHeight: 62, borderRadius: 18, borderWidth: 1.5, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row-reverse', alignItems: 'center', gap: 14 },
  notice: { borderRadius: 18, borderWidth: 1.5, padding: 14, flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 12 },
});