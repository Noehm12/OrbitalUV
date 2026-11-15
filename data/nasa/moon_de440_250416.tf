KPL/FK

Data sections copied verbatim from https://naif.jpl.nasa.gov/pub/naif/generic_kernels/fk/satellites/moon_de440_250416.tf

\begindata

   FRAME_MOON_PA                 = 31000
   FRAME_31000_NAME              = 'MOON_PA'
   FRAME_31000_CLASS             = 4
   FRAME_31000_CLASS_ID          = 31000
   FRAME_31000_CENTER            = 301
   TKFRAME_31000_SPEC            = 'MATRIX'
   TKFRAME_31000_RELATIVE        = 'MOON_PA_DE440'
   TKFRAME_31000_MATRIX          = ( 1 0 0
                                     0 1 0
                                     0 0 1 )

   FRAME_MOON_ME                 = 31001
   FRAME_31001_NAME              = 'MOON_ME'
   FRAME_31001_CLASS             = 4
   FRAME_31001_CLASS_ID          = 31001
   FRAME_31001_CENTER            = 301
   TKFRAME_31001_SPEC            = 'MATRIX'
   TKFRAME_31001_RELATIVE        = 'MOON_ME_DE440_ME421'
   TKFRAME_31001_MATRIX          = ( 1 0 0
                                     0 1 0
                                     0 0 1 )

   FRAME_MOON_PA_DE440           = 31008
   FRAME_31008_NAME              = 'MOON_PA_DE440'
   FRAME_31008_CLASS             = 2
   FRAME_31008_CLASS_ID          = 31008
   FRAME_31008_CENTER            = 301

   FRAME_MOON_ME_DE440_ME421        = 31009
   FRAME_31009_NAME                 = 'MOON_ME_DE440_ME421'
   FRAME_31009_CLASS                = 4
   FRAME_31009_CLASS_ID             = 31009
   FRAME_31009_CENTER               = 301
   TKFRAME_31009_SPEC            = 'ANGLES'
   TKFRAME_31009_RELATIVE        = 'MOON_PA_DE440'
   TKFRAME_31009_ANGLES          = (   67.8526   78.6944   0.2785  )
   TKFRAME_31009_AXES            = (   3,        2,        1       )
   TKFRAME_31009_UNITS           = 'ARCSECONDS'

\begintext
