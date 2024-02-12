ThisBuild / scalaVersion := "2.13.12"

lazy val myPackage = project
  .in(file("."))
  .settings(
    name := "my-package",
    libraryDependencies ++= Seq(
      "org.myorg" %% "dependency-a" % "0.0.0",
      "org.myorg" %% "dependency-b" % "0.0.0",
      "org.myorg" %% "dependency-c" % "0.0.0" % Test
      "org.myorg" %% "dependency-d" % "0.0.0" % Test
    )
  )
